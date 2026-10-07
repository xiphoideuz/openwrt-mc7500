'use strict';
'require form';
'require fs';
'require ui';
'require view';
'require uci';

/*
	luci-app-zte-mc7500 - LuCI interface for the ZTE MC7500 5G ODU.
	Configuration view.

	Copyright 2026, licensed under GPL-3.0, see LICENSE.
*/

var BACKEND = '/usr/bin/zte_mc7500';

return view.extend({
	render: function() {
		var m, s, o;

		m = new form.Map('zte_mc7500',
			_('ZTE MC7500 Settings'),
			_('Connection settings for the ZTE MC7500 outdoor unit. ' +
			  'The password is stored on the router and only used for the modem web API login.'));

		s = m.section(form.NamedSection, 'main', null);
		s.anonymous = false;
		s.addremove = false;

		o = s.option(form.Value, 'ip', _('Modem IP address'),
			_('Address of the ZTE MC7500 web interface.'));
		o.datatype = 'ipaddr';
		o.placeholder = '192.168.254.1';
		o.rmempty = false;

		o = s.option(form.Value, 'user', _('Modem username'),
			_('Web interface username (case sensitive, usually “Admin”).'));
		o.placeholder = 'Admin';
		o.rmempty = false;

		o = s.option(form.Value, 'password', _('Modem password'),
			_('Web interface password.'));
		o.password = true;
		o.rmempty = false;

		o = s.option(form.Value, 'refresh', _('Page refresh (seconds)'),
			_('How often the status page auto-refreshes. Minimum 5. ' +
			  'The last-refresh time is shown at the bottom of the status page.'));
		o.datatype = 'uinteger';
		o.placeholder = '10';
		o.rmempty = false;

		o = s.option(form.Value, 'cache', _('Backend cache (seconds)'),
			_('The status backend answers from cache while it is younger than this. ' +
			  'Protects the modem from too frequent logins. 0 disables the cache.'));
		o.datatype = 'uinteger';
		o.placeholder = '30';
		o.rmempty = false;

		o = s.option(form.Flag, 'sched_reboot', _('Scheduled reboot'),
			_('Reboot the ODU daily at the time below. The cron job is ' +
			  'managed automatically and visible in System → Scheduled Tasks.'));
		o.rmempty = false;
		o.default = '0';

		o = s.option(form.Value, 'sched_hour', _('Reboot hour (0–23)'),
			_('Hour of the daily reboot.'));
		o.datatype = 'and(uinteger,range(0,23))';
		o.placeholder = '4';
		o.rmempty = false;

		o = s.option(form.Value, 'sched_minute', _('Reboot minute (0–59)'),
			_('Minute of the daily reboot.'));
		o.datatype = 'and(uinteger,range(0,59))';
		o.placeholder = '0';
		o.rmempty = false;

		o = s.option(form.Button, '_sched_apply', _('Schedule'),
			_('Saves this page, then writes the cron job from the settings above.'));
		o.inputstyle = 'action';
		o.inputtitle = _('Apply schedule');
		o.onclick = function(ev) {
			/* save the form first, so the cron job reflects the fields above */
			return m.save().then(function() {
				ui.showModal(_('Applying schedule…'), [
					E('p', { 'class': 'spinning' }, _('Updating Scheduled Tasks…'))
				]);
				return L.resolveDefault(fs.exec_direct(BACKEND,
					['schedule', 'apply']), null).then(function() {
					ui.hideModal();
					return L.resolveDefault(fs.exec_direct(BACKEND,
						['schedule', 'show']), null).then(function(res) {
						ui.addNotification(null, E('pre', {},
							(res || '').trim() || _('Schedule applied.')), 'info');
					});
				});
			});
		};

		return m.render();
	}
});
