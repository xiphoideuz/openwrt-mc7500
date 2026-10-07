# luci-app-zte-mc7500

LuCI (JS) interface for the **ZTE MC7500 5G outdoor unit**, in the spirit of
[luci-app-3ginfo-lite](https://github.com/4IceG/luci-app-3ginfo-lite)
(which targets USB/mPCIe modems, while this package talks to the MC7500
over its web API through the OpenWrt router).

![Status page](docs/status.png)

## Features

* **Status page** (`Modem → ZTE MC7500 → Status`, auto-refreshing):
  connection & WAN mode, IPv4/IPv6, ODU uptime, provider/technology/signal,
  LTE + NR cell parameters (RSRP/RSRQ/RSSI/SNR) with bars, SIM details,
  session/day/month counters and the **data-plan block** (plan size, used vs.
  remaining, alert threshold, auto-clear day) — mirroring the modem's own
  *Data Management* page.
* **Configuration page**: modem IP, username, password, page refresh and
  backend cache intervals (stored in `/etc/config/zte_mc7500`).
* **Reboot ODU** button with confirmation.
* **CLI backend** `/usr/bin/zte_mc7500` (also usable over SSH):
  `status [--json] [--cache N]`, `restart`, `cycle <seconds>`.

## How it works

The modem exposes a ubus JSON-RPC API at `https://<modem-ip>/ubus/`.
The backend logs in (`zwrt_web/web_login_info` → salt,
double-SHA256 password → `zwrt_web/web_login` → session token),
queries status/radio/SIM/WAN/usage/plan endpoints and prints one JSON
document. The LuCI view calls it through rpcd `file exec`
(`fs.exec_direct`, same mechanism 3ginfo-lite uses), so no browser
cross-origin traffic to the modem is needed.

## Requirements

* OpenWrt ≥ 21.02 with (JS) LuCI
* `curl`, `sha256sum` (busybox), `jsonfilter` (all in default images)

## Installation

### From this repo (manual)

Copy the files onto the router preserving paths, then:

```sh
chmod +x /usr/bin/zte_mc7500
/etc/init.d/rpcd restart
rm -rf /tmp/luci-*
```

Log out/in to LuCI (or clear the menu cache) and open
**Modem → ZTE MC7500**. Edit `/etc/config/zte_mc7500` (or use the
Configuration page) to match your modem IP/credentials.

### Build as an OpenWrt package

```sh
cp -r luci-app-zte-mc7500 <openwrt-buildroot>/feeds/luci/applications/
make package/luci-app-zte-mc7500/compile
```

## Configuration

`/etc/config/zte_mc7500`:

```
config main 'main'
	option ip '192.168.254.1'
	option user 'Admin'
	option password 'W72L54WV'
	option refresh '10'
	option cache '30'
```

Environment variables `ZTE_IP` / `ZTE_USER` / `ZTE_PASS` override
both UCI and defaults when using the CLI.

## Security notes

* The modem password is stored in clear text in UCI (root-readable only),
  same practice as other LuCI apps holding device credentials.
* Rebooting the ODU drops the mobile link for a few minutes.

## Credits

* View/menu/ACL layout inspired by
  [4IceG/luci-app-3ginfo-lite](https://github.com/4IceG/luci-app-3ginfo-lite)
  (itself forked from [obsy/modemdata](https://github.com/obsy/modemdata)).
* Signal-bar idea follows the koshev-msk calculation referenced there.

## License

GPL-3.0, see [LICENSE](LICENSE).
