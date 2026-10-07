'use strict';
'require view';
'require fs';
'require ui';
'require uci';
'require poll';

/*
	luci-app-zte-mc7500 - LuCI interface for the ZTE MC7500 5G ODU.
	Status view. Structure inspired by 4IceG/luci-app-3ginfo-lite (GPL-3.0),
	backend is the bundled /usr/bin/zte_mc7500 (ubus JSON-RPC to the ODU).

	Copyright 2026, licensed under GPL-3.0, see LICENSE.
*/

var BACKEND = '/usr/bin/zte_mc7500';

function num(v, dflt) {
	var n = parseFloat(v);
	return isNaN(n) ? (dflt || 0) : n;
}

function fmtBytes(b) {
	b = num(b);
	if (b >= 1099511627776) return (b / 1099511627776).toFixed(2) + ' TB';
	if (b >= 1073741824) return (b / 1073741824).toFixed(2) + ' GB';
	if (b >= 1048576) return (b / 1048576).toFixed(2) + ' MB';
	if (b >= 1024) return (b / 1024).toFixed(1) + ' KB';
	return Math.floor(b) + ' B';
}

function fmtDur(s) {
	s = Math.floor(num(s));
	var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600),
	    m = Math.floor(s % 3600 / 60), sec = s % 60;
	if (d > 0) return '%dd %dh %dm'.format(d, h, m);
	if (h > 0) return '%dh %dm %ds'.format(h, m, sec);
	if (m > 0) return '%dm %ds'.format(m, sec);
	return '%ds'.format(sec);
}

function fmtRate(b) {
	var bps = num(b) * 8;
	if (bps >= 1000000000) return (bps / 1000000000).toFixed(2) + ' Gbps';
	if (bps >= 1000000) return (bps / 1000000).toFixed(2) + ' Mbps';
	if (bps >= 1000) return (bps / 1000).toFixed(1) + ' Kbps';
	return Math.floor(bps) + ' bps';
}

function fmtHMS(s) {
	s = Math.floor(num(s));
	var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60),
	    sec = s % 60;
	return '%02d:%02d:%02d'.format(h, m, sec);
}

/* data-session state from connect_status: 'up' / 'down' / 'unknown' */
function connState(st) {
	st = String(st || '');
	if (/disconnect/i.test(st))
		return 'down';
	if (/connect/i.test(st))
		return 'up';
	return 'unknown';
}

function sigColor(v, good, fair) {	if (v == null || v === '' || isNaN(+v)) return '#999';
	v = +v;
	if (v >= good) return 'limegreen';
	if (v >= fair) return 'gold';
	return 'tomato';
}

/* horizontal bar, returns element; update via setBar(el, pct, color) */
function makeBar() {
	var fill = E('div', {
		'style': 'height:100%;width:0%;background:#999;border-radius:3px;transition:width .4s;'
	});
	return E('div', {
		'style': 'display:inline-block;vertical-align:middle;width:140px;height:12px;' +
		         'background:#eee;border:1px solid #ccc;border-radius:3px;margin-right:6px;'
	}, fill);
}

function setBar(bar, pct, color) {
	pct = Math.max(0, Math.min(100, num(pct)));
	var fill = bar.firstElementChild;
	fill.style.width = pct.toFixed(1) + '%';
	if (color)
		fill.style.background = color;
}

/* RSRP in [-140,-44]: map to 0..100 */
function rsrpPct(v) {
	v = num(v, -140);
	return Math.max(0, Math.min(100, (v + 140) / 96 * 100));
}

function valCell(id) {
	return E('td', { 'id': id }, '–');
}

function row2(table, label, id) {
	table.appendChild(E('tr', [
		E('td', { 'style': 'width:40%' }, label),
		valCell(id)
	]));
}

function fmtDateTime(ts) {
	if (!ts) return '–';
	var d = new Date(ts);
	return d.toLocaleString();
}

function setText(id, txt) {
	var el = document.getElementById(id);
	if (el)
		el.textContent = (txt == null || txt === '') ? '–' : String(txt);
}

return view.extend({
	load: function() {
		return uci.load('zte_mc7500').then(function() {
			var refresh = parseInt(uci.get('zte_mc7500', 'main', 'refresh'), 10) || 10;
			var cache = parseInt(uci.get('zte_mc7500', 'main', 'cache'), 10);
			if (isNaN(cache))
				cache = 30;
			if (refresh < 5)
				refresh = 5;
			return { refresh: refresh, cache: cache };
		});
	},

	fetchStatus: function(cache) {
		var args = ['status', '--json'];
		if (cache > 0)
			args = args.concat(['--cache', String(cache)]);
		return L.resolveDefault(fs.exec_direct(BACKEND, args), null).then(function(res) {
			if (!res)
				return null;
			try {
				return JSON.parse(typeof res === 'string' ? res : res.stdout);
			}
			catch (e) {
				return null;
			}
		});
	},

	updateFooter: function(json) {
		if (json && json.radio) {
			var when = fmtDateTime(Date.now());
			var meta = json.meta || {};
			if (meta.generated) {
				var age = Math.max(0, Math.round(Date.now() / 1000 - num(meta.generated)));
				if (meta.cached === true)
					setText('zte-lastrefresh',
						_('Last refresh: %s (from cache, %ss old)').format(when, age));
				else if (meta.cached === false)
					setText('zte-lastrefresh',
						_('Last refresh: %s (live from modem)').format(when));
				else
					setText('zte-lastrefresh',
						_('Last refresh: %s').format(when));
			}
			else {
				setText('zte-lastrefresh',
					_('Last refresh: %s').format(when));
			}
		}
		else {
			setText('zte-lastrefresh',
				_('Last attempt: %s (failed)').format(fmtDateTime(Date.now())));
		}
	},

	updateView: function(json) {
		this.updateFooter(json);
		var banner = document.getElementById('zte-offline');
		if (!json || !json.radio) {
			if (banner)
				banner.style.display = '';
			return;
		}
		if (banner)
			banner.style.display = 'none';

		var wan = json.wan || {}, radio = json.radio || {}, sim = json.sim || {},
		    iface = json.iface || {}, usage = json.usage || {},
		    device = json.device || {}, plan = json.plan || {},
		    clearday = json.clearday || {};

		setText('zte-opms', (wan.opms_wan_mode || '?') +
			' (auto: ' + (wan.opms_wan_auto_mode || '?') + ')');
		setText('zte-wanstatus', (wan.current_wan_status || '?') +
			' / ' + (iface.connect_status || '?'));
		var cs = connState(iface.connect_status);
		if (cs === 'up' && usage.real_time)
			setText('zte-connsession', '%s (%s %s)'.format(
				_('up'), _('connected'), fmtHMS(usage.real_time)));
		else
			setText('zte-connsession', _(cs));
		var toggle = document.getElementById('zte-connbtn');
		if (toggle)
			toggle.textContent = (cs === 'up') ? _('Disconnect') : _('Connect');
		setText('zte-ipv4', (iface.ipv4_address || '?') +
			'  gw ' + (iface.ipv4_gateway || '?'));
		setText('zte-ipv6', iface.ipv6_address || '–');
		setText('zte-uptime', fmtDur(device.device_uptime));

		setText('zte-provider', (radio.network_provider_fullname || '?') +
			' (' + (radio.simcard_roam || '?') + ')');
		setText('zte-tech', (radio.network_type || '?') +
			'   ' + _('signal') + ': ' + (radio.signalbar || '?') + '/5');

		setText('zte-ltecell', '%s  ch %s  pci %s  cell %s  lac %s'.format(
			radio.wan_active_band || '?', radio.wan_active_channel || '?',
			radio.lte_pci || '?', radio.cell_id || '?', radio.lac_code || '?'));
		setText('zte-ltersrp', '%s dBm'.format(radio.lte_rsrp ?? '?'));
		setText('zte-ltersrq', '%s dB'.format(radio.lte_rsrq ?? '?'));
		setText('zte-lterssi', '%s dBm'.format(radio.lte_rssi ?? '?'));
		setText('zte-ltesnr', '%s dB'.format(radio.lte_snr ?? '?'));
		setBar(document.getElementById('zte-ltebar'), rsrpPct(radio.lte_rsrp),
			sigColor(+radio.lte_rsrp, -80, -100));

		if (radio.nr5g_action_band) {
			setText('zte-nrcell', 'n%s  ch %s  pci %s  bw %s MHz'.format(
				radio.nr5g_action_band, radio.nr5g_action_channel || '?',
				radio.nr5g_pci || '?', radio.nr5g_bandwidth || '?'));
			setText('zte-nrrsrp', '%s dBm'.format(radio.nr5g_rsrp ?? '?'));
			setText('zte-nrrsrq', '%s dB'.format(radio.nr5g_rsrq ?? '?'));
			setText('zte-nrrssi', '%s dBm'.format(radio.nr5g_rssi ?? '?'));
			setText('zte-nrsnr', '%s dB'.format(radio.nr5g_snr ?? '?'));
			setBar(document.getElementById('zte-nrbar'), rsrpPct(radio.nr5g_rsrp),
				sigColor(+radio.nr5g_rsrp, -80, -100));
			var nrbox = document.getElementById('zte-nrbox');
			if (nrbox)
				nrbox.style.display = '';
		}

		setText('zte-simstate', '%s / %s (%s %s)'.format(
			sim.sim_states || '?', sim.modem_main_state || '?',
			_('slot'), sim.current_sim_slot || '?'));
		setText('zte-iccid', sim.sim_iccid);
		setText('zte-imsi', sim.sim_imsi);
		setText('zte-msisdn', sim.msisdn);

		setText('zte-session', '%s ↓ / %s ↑  (%s)'.format(
			fmtBytes(usage.real_rx_bytes), fmtBytes(usage.real_tx_bytes),
			fmtDur(usage.real_time)));
		setText('zte-speed', '%s ↓ / %s ↑'.format(
			fmtRate(usage.real_rx_speed), fmtRate(usage.real_tx_speed)));
		setText('zte-day', '%s ↓ / %s ↑'.format(
			fmtBytes(usage.day_rx_bytes), fmtBytes(usage.day_tx_bytes)));
		setText('zte-month', '%s ↓ / %s ↑'.format(
			fmtBytes(usage.month_rx_bytes), fmtBytes(usage.month_tx_bytes)));

		/* data plan block, mirrors the ODU "Data Management" page */
		var planbox = document.getElementById('zte-planbox');
		if (plan.enable == 1 && plan.type == 2 && plan.value) {
			var used = num(usage.month_rx_bytes) + num(usage.month_tx_bytes);
			var total = num(plan.value), ratio = num(plan.ratio);
			var pct = total > 0 ? used / total * 100 : 0;
			var remain = Math.max(0, total - used);
			if (planbox)
				planbox.style.display = '';
			setText('zte-plan', '%s (%s)'.format(fmtBytes(total), _('data')));
			setText('zte-plan-clear', (clearday.enable == 1 && clearday.clearday)
				? _('auto-clears on day %s').format(clearday.clearday) : '–');
			setText('zte-plan-used', '%s / %s (%s%%)'.format(
				fmtBytes(used), fmtBytes(total), pct.toFixed(1)));
			setBar(document.getElementById('zte-planbar'), pct,
				pct >= ratio && ratio > 0 ? 'tomato' :
				pct >= ratio * 0.8 && ratio > 0 ? 'gold' : 'limegreen');
			setText('zte-plan-remain', fmtBytes(remain));
			if (ratio > 0) {
				setText('zte-plan-alert', '%s%% (%s)'.format(ratio, fmtBytes(total * ratio / 100)));
				var over = document.getElementById('zte-plan-over');
				if (over)
					over.style.display = (pct >= ratio) ? '' : 'none';
			}
		}
		else if (planbox) {
			planbox.style.display = 'none';
		}
	},

	runConnCmd: function(cmd, doneMsg) {
		var self = this;
		ui.showModal(_('Please wait…'), [
			E('p', { 'class': 'spinning' }, doneMsg || _('Sending command to the ODU…'))
		]);
		L.resolveDefault(fs.exec_direct(BACKEND, [cmd]), null).then(function() {
			/* session-changing commands invalidate the cache */
			return self.fetchStatus(0);
		}).then(function(json) {
			ui.hideModal();
			self.updateView(json);
		});
	},

	handleConnToggle: function(ev) {
		var self = this;
		var label = (document.getElementById('zte-connbtn') || {}).textContent || '';
		if (label === _('Disconnect')) {
			ui.showModal(_('Disconnect data session'), [
				E('p', _('Really disconnect? The mobile connection will go down.')),
				E('div', { 'class': 'right' }, [
					E('button', {
						'class': 'btn',
						'click': ui.hideModal
					}, _('Cancel')),
					' ',
					E('button', {
						'class': 'btn cbi-button-negative important',
						'click': function() {
							self.runConnCmd('disconnect');
						}
					}, _('Disconnect'))
				])
			]);
		}
		else {
			self.runConnCmd('connect');
		}
	},

	handleReconnect: function(ev) {
		var self = this;
		ui.showModal(_('Reconnect data session'), [
			E('p', _('Drop and re-establish the mobile connection? ' +
				'It will be briefly down.')),
			E('div', { 'class': 'right' }, [
				E('button', {
					'class': 'btn',
					'click': ui.hideModal
				}, _('Cancel')),
				' ',
				E('button', {
					'class': 'btn cbi-button-action important',
					'click': function() {
						self.runConnCmd('reconnect');
					}
				}, _('Reconnect'))
			])
		]);
	},

	handleReboot: function(ev) {		var self = this;
		ui.showModal(_('Reboot ZTE MC7500'), [
			E('p', _('Really reboot the outdoor unit? The mobile connection ' +
				'will be down for a few minutes.')),
			E('div', { 'class': 'right' }, [
				E('button', {
					'class': 'btn',
					'click': ui.hideModal
				}, _('Cancel')),
				' ',
				E('button', {
					'class': 'btn cbi-button-action important',
					'click': function() {
						ui.showModal(_('Rebooting…'), [
							E('p', { 'class': 'spinning' },
								_('Reboot command sent. Waiting for the ODU to come back…'))
						]);
						L.resolveDefault(fs.exec_direct(BACKEND, ['restart']), null)
							.then(function() {
								window.setTimeout(function() {
									ui.hideModal();
									self.fetchStatus(0).then(function(json) {
										self.updateView(json);
									});
								}, 90000);
							});
					}
				}, _('Reboot'))
			])
		]);
	},

	render: function(cfg) {
		var self = this;

		var connTable = E('table', { 'class': 'table' });
		row2(connTable, _('WAN mode'), 'zte-opms');
		row2(connTable, _('WAN status'), 'zte-wanstatus');
		row2(connTable, _('Data session'), 'zte-connsession');
		row2(connTable, _('IPv4'), 'zte-ipv4');
		row2(connTable, _('IPv6'), 'zte-ipv6');
		row2(connTable, _('ODU uptime'), 'zte-uptime');

		var radioTable = E('table', { 'class': 'table' });
		row2(radioTable, _('Provider'), 'zte-provider');
		row2(radioTable, _('Technology'), 'zte-tech');
		row2(radioTable, _('LTE cell'), 'zte-ltecell');
		radioTable.appendChild(E('tr', [
			E('td', _('LTE RSRP / RSRQ / RSSI / SNR')),
			E('td', [
				E('span', { 'id': 'zte-ltersrp' }, '–'), ' / ',
				E('span', { 'id': 'zte-ltersrq' }, '–'), ' / ',
				E('span', { 'id': 'zte-lterssi' }, '–'), ' / ',
				E('span', { 'id': 'zte-ltesnr' }, '–'),
				E('br'), makeBar() /* filled below, given an id */
			])
		]));
		/* tag the bar element created above */
		radioTable.querySelector('tr:last-child td:last-child div').id = 'zte-ltebar';

		var nrRows = E('tbody', { 'id': 'zte-nrbox', 'style': 'display:none' }, [
			E('tr', [
				E('td', { 'style': 'width:40%' }, _('NR cell')),
				E('td', { 'id': 'zte-nrcell' }, '–')
			]),
			E('tr', [
				E('td', _('NR RSRP / RSRQ / RSSI / SNR')),
				E('td', [
					E('span', { 'id': 'zte-nrrsrp' }, '–'), ' / ',
					E('span', { 'id': 'zte-nrrsrq' }, '–'), ' / ',
					E('span', { 'id': 'zte-nrrssi' }, '–'), ' / ',
					E('span', { 'id': 'zte-nrsnr' }, '–'),
					E('br'), makeBar()
				])
			])
		]);
		nrRows.querySelector('tr:last-child td:last-child div').id = 'zte-nrbar';
		radioTable.appendChild(nrRows);

		var simTable = E('table', { 'class': 'table' });
		row2(simTable, _('SIM state'), 'zte-simstate');
		row2(simTable, _('ICCID'), 'zte-iccid');
		row2(simTable, _('IMSI'), 'zte-imsi');
		row2(simTable, _('MSISDN'), 'zte-msisdn');

		var dataTable = E('table', { 'class': 'table' });
		row2(dataTable, _('Session'), 'zte-session');
		row2(dataTable, _('Speed now'), 'zte-speed');
		row2(dataTable, _('Today'), 'zte-day');
		row2(dataTable, _('This month'), 'zte-month');

		var planTable = E('table', { 'class': 'table' });
		row2(planTable, _('Plan'), 'zte-plan');
		row2(planTable, _('Counter reset'), 'zte-plan-clear');
		planTable.appendChild(E('tr', [
			E('td', _('Used')),
			E('td', [
				E('span', { 'id': 'zte-plan-used' }, '–'),
				E('br'), makeBar()
			])
		]));
		planTable.querySelector('tr:last-child td:last-child div').id = 'zte-planbar';
		row2(planTable, _('Remaining'), 'zte-plan-remain');
		row2(planTable, _('Alert at'), 'zte-plan-alert');
		var planOver = E('p', {
			'id': 'zte-plan-over',
			'class': 'alert-message warning',
			'style': 'display:none'
		}, _('Data usage has reached the alert threshold!'));

		var view = E('div', { 'class': 'cbi-section' }, [
			E('div', {
				'id': 'zte-offline',
				'class': 'alert-message error',
				'style': 'display:none'
			}, _('Cannot reach the ZTE MC7500. Check the IP address, credentials and cabling.')),
			E('h2', _('Connection')),
			connTable,
			E('h2', _('Radio')),
			radioTable,
			E('h2', _('SIM')),
			simTable,
			E('h2', _('Data counters')),
			dataTable,
			E('div', { 'id': 'zte-planbox', 'style': 'display:none' }, [
				E('h2', _('Data plan')),
				planTable,
				planOver
			]),
			E('div', { 'id': 'zte-footer', 'style': 'display:flex;justify-content:space-between;flex-wrap:wrap;font-size:85%;color:#666;margin:6px 0;' }, [
				E('span', { 'id': 'zte-lastrefresh' }, _('Last refresh: %s').format('–')),
				E('span', { 'id': 'zte-autorefresh' },
					_('Auto-refresh every %ss (cache %ss)').format(cfg.refresh, cfg.cache))
			]),
			E('div', { 'class': 'cbi-page-actions' }, [
				E('button', {
					'class': 'btn cbi-button-action',
					'click': function() {
						self.fetchStatus(0).then(function(json) {
							self.updateView(json);
						});
					}
				}, _('Refresh now')),
				' ',
				E('button', {
					'id': 'zte-connbtn',
					'class': 'btn cbi-button-action',
					'click': ui.createHandlerFn(self, self.handleConnToggle)
				}, _('Connect')),
				' ',
				E('button', {
					'class': 'btn cbi-button-action',
					'click': ui.createHandlerFn(self, self.handleReconnect)
				}, _('Reconnect')),
				' ',
				E('button', {
					'class': 'btn cbi-button-negative',
					'click': ui.createHandlerFn(self, self.handleReboot)
				}, _('Reboot ODU'))
			])
		]);

		self.fetchStatus(cfg.cache).then(function(json) {
			self.updateView(json);
		});

		poll.add(function() {
			return self.fetchStatus(cfg.cache).then(function(json) {
				self.updateView(json);
			});
		}, cfg.refresh);

		return view;
	}
});
