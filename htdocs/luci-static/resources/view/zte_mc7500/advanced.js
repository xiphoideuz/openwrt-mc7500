'use strict';
'require view';
'require fs';
'require ui';

/*
	luci-app-zte-mc7500 - LuCI interface for the ZTE MC7500 5G ODU.
	Advanced radio view: band locks, network mode, antenna, saved states.

	PolyForm Noncommercial License 1.0.0 applies — hobbyists and personal
	use permitted; commercial use requires contacting the copyright holder.

	Copyright 2026, licensed under PolyForm Noncommercial License 1.0.0, see LICENSE.
*/

var BACKEND = '/usr/bin/zte_mc7500';

function setT(id, txt) {
	var el = document.getElementById(id);
	if (el)
		el.textContent = (txt == null || txt === '') ? '–' : String(txt);
}

function parseRes(res) {
	if (!res)
		return null;
	try {
		return JSON.parse(typeof res === 'string' ? res : res.stdout);
	}
	catch (e) {
		return null;
	}
}

function rawOut(res) {
	if (!res)
		return '';
	return (typeof res === 'string' ? res : (res.stdout || '')).trim();
}

return view.extend({
	load: function() {
		return null;
	},

	refreshAll: function() {
		var self = this;
		return L.resolveDefault(Promise.all([
			L.resolveDefault(fs.exec_direct(BACKEND, ['bands', '--json']), null).then(parseRes),
			L.resolveDefault(fs.exec_direct(BACKEND, ['states', 'list', '--json']), null).then(parseRes),
			L.resolveDefault(fs.exec_direct(BACKEND, ['apn', '--json']), null).then(parseRes)
		]), [null, null, null]).then(function(r) {
			self.updateBands(r[0]);
			self.updateStates(r[1]);
			self.updateApn(r[2]);
		});
	},

	updateBands: function(b) {
		if (!b)
			return;
		setT('zte-adv-cur',
			'LTE %s   NR-SA %s   NR-NSA %s   mode %s   ant %s'.format(
				b.lte_band || _('auto'), b.nr5g_sa_band_lock || _('auto'),
				b.nr5g_nsa_band_lock || _('auto'),
				b.net_select || '?', b.antenna || '?'));
		var le = document.getElementById('zte-adv-lte');
		if (le && b.lte_band)
			le.placeholder = b.lte_band;
		var se = document.getElementById('zte-adv-sa');
		if (se && b.nr5g_sa_band_lock)
			se.placeholder = b.nr5g_sa_band_lock;
		var ne = document.getElementById('zte-adv-nsa');
		if (ne && b.nr5g_nsa_band_lock)
			ne.placeholder = b.nr5g_nsa_band_lock;
		var nm = document.getElementById('zte-adv-netmode');
		if (nm && b.net_select)
			nm.value = b.net_select;
		var an = document.getElementById('zte-adv-ant');
		if (an && b.antenna)
			an.value = b.antenna;
	},

	updateStates: function(list) {
		var self = this;
		var tb = document.getElementById('zte-adv-states');
		if (!tb)
			return;
		while (tb.firstChild)
			tb.removeChild(tb.firstChild);
		if (!list || !list.length) {
			tb.appendChild(E('tr', [
				E('td', { 'colspan': '4' }, _('No saved states yet.'))
			]));
			return;
		}
		list.forEach(function(st) {
			var nm = st.name;
			tb.appendChild(E('tr', [
				E('td', {}, nm),
				E('td', {}, 'LTE %s / SA %s / %s'.format(
					st.lte || _('auto'), st.sa || _('auto'), st.net || '?')),
				E('td', {}, E('button', {
					'class': 'btn cbi-button-action',
					'click': function() {
						self.confirmRun(
							_('Restore radio state'),
							_('Restore the saved state “%s”? The connection may drop briefly.').format(nm),
							['states', 'restore', nm]);
					}
				}, _('Restore'))),
				E('td', {}, E('button', {
					'class': 'btn cbi-button-negative',
					'click': function() {
						self.confirmRun(
							_('Delete radio state'),
							_('Delete the saved state “%s”?').format(nm),
							['states', 'delete', nm]);
					}
				}, _('Delete')))
			]));
		});
	},

	updateApn: function(a) {
		if (!a || !a.profile)
			return;
		setT('zte-adv-apn-prof', a.profile);
		setT('zte-adv-apn-apn', '%s (%s)'.format(a.apn || '?', a.pdp || '?'));
		setT('zte-adv-apn-auth', '%s / %s'.format(
			(a.auth != null) ? a.auth : '?', a.user || _('(none)')));
	},

	confirmRun: function(title, body, argv) {
		var self = this;
		ui.showModal(title, [
			E('p', {}, body),
			E('div', { 'class': 'right' }, [
				E('button', {
					'class': 'btn',
					'click': ui.hideModal
				}, _('Cancel')),
				' ',
				E('button', {
					'class': 'btn cbi-button-action important',
					'click': function() {
						ui.showModal(_('Please wait…'), [
							E('p', { 'class': 'spinning' }, _('Sending command to the ODU…'))
						]);
						L.resolveDefault(fs.exec_direct(BACKEND, argv), null).then(function(res) {
							ui.hideModal();
							ui.addNotification(null,
								E('pre', {}, rawOut(res) || _('Done.')), 'info');
							self.refreshAll();
						});
					}
				}, _('Apply'))
			])
		]);
	},

	handleBandApply: function(which) {
		var self = this;
		var map = { lte: 'zte-adv-lte', sa: 'zte-adv-sa', nsa: 'zte-adv-nsa' };
		var el = document.getElementById(map[which]);
		var val = (el && el.value || '').replace(/[\s]+/g, '');
		if (!/^[0-9]+(,[0-9]+)*$/.test(val)) {
			ui.addNotification(null, E('p', {},
				_('Enter a comma-separated band list, e.g. 3,5.')), 'info');
			return;
		}
		self.confirmRun(_('Lock radio bands'),
			_('Lock %s bands to %s? The connection may drop briefly. A wrong mask can cut service until reset.').format(which.toUpperCase(), val),
			['bandlock', which, val]);
	},

	handleBandReset: function() {
		this.confirmRun(_('Reset bands'),
			_('Reset all band and cell locks to the modem auto state?'),
			['bandunlock']);
	},

	handleNetmode: function() {
		var el = document.getElementById('zte-adv-netmode');
		var val = el ? el.value : '';
		this.confirmRun(_('Network mode'),
			_('Switch network mode to %s? The modem will re-register.').format(val),
			['netmode', val]);
	},

	handleAntenna: function() {
		var el = document.getElementById('zte-adv-ant');
		var val = el ? el.value : '';
		this.confirmRun(_('Antenna'),
			_('Switch the ODU antenna to %s?').format(val),
			['antenna', val]);
	},

	handleStateSave: function() {
		var el = document.getElementById('zte-adv-statename');
		var val = (el && el.value || '').trim();
		if (!/^[A-Za-z0-9_-]+$/.test(val)) {
			ui.addNotification(null, E('p', {},
				_('State name: letters, digits, _ or -.')) , 'info');
			return;
		}
		var self = this;
		ui.showModal(_('Please wait…'), [
			E('p', { 'class': 'spinning' }, _('Saving radio state…'))
		]);
		L.resolveDefault(fs.exec_direct(BACKEND,
			['states', 'save', val]), null).then(function(res) {
			ui.hideModal();
			ui.addNotification(null,
				E('pre', {}, rawOut(res) || _('Done.')), 'info');
			if (el)
				el.value = '';
			self.refreshAll();
		});
	},

	render: function() {
		var self = this;

		function bandRow(label, inputId, which) {
			return E('tr', [
				E('td', { 'style': 'width:40%' }, label),
				E('td', {}, [
					E('input', {
						'id': inputId,
						'type': 'text',
						'style': 'width:12em',
						'placeholder': 'e.g. 3,5'
					}),
					' ',
					E('button', {
						'class': 'btn cbi-button-action',
						'click': function() { self.handleBandApply(which); }
					}, _('Apply'))
				])
			]);
		}

		var bandTable = E('table', { 'class': 'table' }, [
			bandRow(_('LTE bands'), 'zte-adv-lte', 'lte'),
			bandRow(_('NR SA bands'), 'zte-adv-sa', 'sa'),
			bandRow(_('NR NSA bands'), 'zte-adv-nsa', 'nsa')
		]);

		var modeTable = E('table', { 'class': 'table' }, [
			E('tr', [
				E('td', { 'style': 'width:40%' }, _('Network mode')),
				E('td', {}, [
					E('select', { 'id': 'zte-adv-netmode' }, [
						E('option', { 'value': 'WL_AND_5G' }, '5G/4G (auto)'),
						E('option', { 'value': 'LTE_AND_5G' }, '5G NSA'),
						E('option', { 'value': 'Only_5G' }, '5G SA'),
						E('option', { 'value': 'Only_LTE' }, '4G only')
					]),
					' ',
					E('button', {
						'class': 'btn cbi-button-action',
						'click': function() { self.handleNetmode(); }
					}, _('Apply'))
				])
			]),
			E('tr', [
				E('td', _('Antenna')),
				E('td', {}, [
					E('select', { 'id': 'zte-adv-ant' }, [
						E('option', { 'value': 'auto' }, _('auto')),
						E('option', { 'value': 'front_directional' }, _('front directional'))
					]),
					' ',
					E('button', {
						'class': 'btn cbi-button-action',
						'click': function() { self.handleAntenna(); }
					}, _('Apply'))
				])
			])
		]);

		var statesTable = E('table', { 'class': 'table' }, [
			E('thead', {}, E('tr', { 'class': 'tr' }, [
				E('th', {}, _('Name')),
				E('th', {}, _('Contents')),
				E('th', {}, ''),
				E('th', {}, '')
			])),
			E('tbody', { 'id': 'zte-adv-states' }, [])
		]);

		var apnTable = E('table', { 'class': 'table' }, [
			E('tr', [E('td', { 'style': 'width:40%' }, _('Profile')), E('td', { 'id': 'zte-adv-apn-prof' }, '–')]),
			E('tr', [E('td', _('APN')), E('td', { 'id': 'zte-adv-apn-apn' }, '–')]),
			E('tr', [E('td', _('Auth / user')), E('td', { 'id': 'zte-adv-apn-auth' }, '–')])
		]);

		var view = E('div', { 'class': 'cbi-section' }, [
			E('div', { 'class': 'alert-message warning' }, [
				E('strong', {}, _('Advanced settings — Proceed at your own risk')),
				E('p', {}, _('Band locks, network mode and antenna changes can drop the mobile connection. Save the working state first, so you can restore it.'))
			]),
			E('h2', _('Band lock')),
			E('p', { 'class': 'cbi-section-descr' },
				_('Comma-separated band numbers, e.g. 3,5.')),
			E('p', { 'id': 'zte-adv-cur', 'style': 'font-family:monospace' }, '–'),
			bandTable,
			E('div', { 'class': 'cbi-page-actions' }, [
				E('button', {
					'class': 'btn cbi-button-negative',
					'click': function() { self.handleBandReset(); }
				}, _('Reset all to auto'))
			]),
			E('h2', _('Network mode / antenna')),
			modeTable,
			E('h2', _('Saved states')),
			E('p', { 'class': 'cbi-section-descr' },
				_('Snapshots of the radio policy, kept in a flatfile on the router (%s).').format('/etc/zte_mc7500.states')),
			E('div', {}, [
				E('input', {
					'id': 'zte-adv-statename',
					'type': 'text',
					'style': 'width:12em',
					'placeholder': _('name')
				}),
				' ',
				E('button', {
					'class': 'btn cbi-button-action',
					'click': function() { self.handleStateSave(); }
				}, _('Save current as…'))
			]),
			E('div', { 'style': 'margin-top:6px' }, [statesTable]),
			E('h2', _('APN (read-only)')),
			E('p', { 'class': 'cbi-section-descr' },
				_('The modem stores the password encrypted; it cannot be shown or changed here.')),
			apnTable
		]);

		self.refreshAll();

		return view;
	}
});
