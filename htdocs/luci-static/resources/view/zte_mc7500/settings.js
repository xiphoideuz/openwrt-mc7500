'use strict';
'require form';
'require view';
'require uci';

/*
	luci-app-zte-mc7500 - LuCI interface for the ZTE MC7500 5G ODU.
	Configuration view. Inspired by 4IceG/luci-app-3ginfo-lite (GPL-3.0).

	Copyright 2026, licensed under GPL-3.0, see LICENSE.
*/

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
			_('Web interface username (case sensitive, usually "Admin").'));
		o.placeholder = 'Admin';
		o.rmempty = false;

		o = s.option(form.Value, 'password', _('Modem password'),
			_('Web interface password.'));
		o.password = true;
		o.rmempty = false;

		o = s.option(form.Value, 'refresh', _('Page refresh (seconds)'),
			_('How often the status page polls the modem. Minimum 5.'));
		o.datatype = 'uinteger';
		o.placeholder = '10';
		o.rmempty = false;

		o = s.option(form.Value, 'cache', _('Backend cache (seconds)'),
			_('The status backend answers from cache while it is younger than this. ' +
			  'Protects the modem from too frequent logins. 0 disables the cache.'));
		o.datatype = 'uinteger';
		o.placeholder = '30';
		o.rmempty = false;

		return m.render();
	}
});
