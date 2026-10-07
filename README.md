# openwrt-mc7500 — luci-app-zte-mc7500

LuCI (JS) interface + standalone shell tool for the **ZTE MC7500 5G outdoor
unit**, in the spirit of
[luci-app-3ginfo-lite](https://github.com/4IceG/luci-app-3ginfo-lite)
(which targets USB/mPCIe modems, while this talks to the MC7500 over its
web API through the OpenWrt router).

This repo is an **OpenWrt LuCI application package** (buildable with the
OpenWrt SDK / feeds), and it also contains a **standalone CLI backend**
that works on its own without LuCI.

Status page sections: Connection, Radio (LTE + NR with signal bars),
SIM, Data counters, Data plan (used/remaining vs. plan, alert threshold),
auto-refresh with a last-refresh indicator, plus Connect / Reconnect /
Refresh / Reboot buttons.

## Flavours

| Flavour | What you get | Needs |
|---|---|---|
| **LuCI app** (this repo as a package) | Status + Configuration pages under Modem → ZTE MC7500 | OpenWrt ≥ 21.02 with (JS) LuCI |
| **Standalone CLI** (`root/usr/bin/zte_mc7500`) | Same status/control over SSH, no web UI needed | `curl`, `sha256sum` (busybox), `jsonfilter` (all in default images) |

Both flavours share one backend script, so the CLI shows exactly what
the LuCI page shows.

## Features

* **Status page** (`Modem → ZTE MC7500 → Status`):
  connection & WAN mode, IPv4/IPv6, ODU uptime, provider/technology/signal,
  LTE + NR cell parameters (RSRP/RSRQ/RSSI/SNR) with bars, SIM details,
  session/day/month counters and the **data-plan block** (plan size, used vs.
  remaining, alert threshold, auto-clear day) — mirroring the modem's own
  *Data Management* page.
* **Auto-refresh with last-refresh indicator**: the page re-polls
  automatically; the footer shows when the data was last refreshed and
  whether it is **live from the modem** or **served from cache (with its
  age)**. The poll interval is settable in the Configuration page
  (`Page refresh`), the cache window via `Backend cache`.
* **Configuration page**: modem IP, username, password, page refresh,
  backend cache, and the **scheduled daily reboot** (enable + hour/minute,
  materialized as a cron job visible in System → Scheduled Tasks).
* **Reboot ODU** button with confirmation, plus **Connect / Disconnect /
  Reconnect** buttons for the data session (like the modem homepage button).
* **CLI backend** `/usr/bin/zte_mc7500` (also usable over SSH):

```sh
zte_mc7500 status                    # human-readable, 3ginfo-style
zte_mc7500 status --json             # machine-readable JSON
zte_mc7500 status --json --cache 30  # serve cache younger than 30s
zte_mc7500 connect                    # data session up
zte_mc7500 disconnect                 # data session down
zte_mc7500 reconnect                   # down, wait, up
zte_mc7500 restart                    # reboot the ODU
zte_mc7500 schedule                   # show scheduled reboot
zte_mc7500 schedule 04:00            # daily reboot at 04:00
zte_mc7500 schedule off              # disable scheduled reboot
zte_mc7500 cycle 3600                # status + reboot every hour
zte_mc7500 --version
```

## Data freshness (not realtime — by design)

Each status poll logs into the modem and runs ~8 RPC calls, so two
knobs protect the ODU from being hammered:

* `Page refresh` (default 10 s, minimum 5): how often the LuCI page
  re-polls. Shown in the footer as `Auto-refresh every Ns`.
* `Backend cache` (default 30 s, 0 disables): while the cached reply is
  younger than this, the backend answers from `/tmp/zte_mc7500.json`
  without touching the modem.

The bottom-left footer always tells you the truth:
`Last refresh: <time> (live from modem)` or
`Last refresh: <time> (from cache, 12s old)`. If the modem is unreachable
it shows the last attempt time and an error banner. So: values are fresh
to within roughly `cache` seconds, never second-by-second realtime.

## Scheduled reboot

Set it from the Configuration page (Save & Apply, then *Apply schedule*),
or from the CLI (`zte_mc7500 schedule 04:00`). Either way the result is a
marked cron block in `/etc/crontabs/root`, therefore visible and editable
in LuCI under System → Scheduled Tasks:

```
# --- zte-mc7500 scheduled reboot: managed automatically, do not edit ---
0 4 * * * /usr/bin/zte_mc7500 restart
# --- end zte-mc7500 ---
```

The `/etc/init.d/zte-mc7500` service (`enable` it) re-syncs the block
from UCI at boot. A daily cron job is usually enough; for sub-hour
intervals use `zte_mc7500 cycle <seconds>` instead (the ODU also has a
native scheduled-reboot feature, but a cron job is visible and easy
to change).

## How it works

The modem exposes a ubus JSON-RPC API at `https://<modem-ip>/ubus/`.
The backend logs in (`zwrt_web/web_login_info` → salt,
double-SHA256 password → `zwrt_web/web_login` → session token),
queries status/radio/SIM/WAN/usage/plan endpoints and prints one JSON
document (with `meta.generated` / `meta.cached` so the UI can show data
age). The LuCI view calls it through rpcd `file exec`
(`fs.exec_direct`, same mechanism 3ginfo-lite uses), so no browser
cross-origin traffic to the modem is needed.

## Installation

### Option A — full LuCI app from GitHub (manual copy)

On the router (SSH), download and unpack the repo, then copy the files
over preserving paths:

```sh
cd /tmp
wget https://github.com/xiphoideuz/openwrt-mc7500/archive/refs/heads/main.tar.gz \
  -O openwrt-mc7500.tar.gz
tar xzf openwrt-mc7500.tar.gz
cp -r openwrt-mc7500-main/htdocs/* /www/ 2>/dev/null
cp -r openwrt-mc7500-main/htdocs/luci-static/* /www/luci-static/
cp openwrt-mc7500-main/root/usr/bin/zte_mc7500 /usr/bin/zte_mc7500
cp openwrt-mc7500-main/root/etc/init.d/zte-mc7500 /etc/init.d/zte-mc7500
cp openwrt-mc7500-main/root/etc/config/zte_mc7500 /etc/config/zte_mc7500
cp openwrt-mc7500-main/root/usr/share/luci/menu.d/* /usr/share/luci/menu.d/
cp openwrt-mc7500-main/root/usr/share/rpcd/acl.d/* /usr/share/rpcd/acl.d/
chmod +x /usr/bin/zte_mc7500 /etc/init.d/zte-mc7500
/etc/init.d/zte-mc7500 enable
/etc/init.d/rpcd restart
rm -rf /tmp/luci-*
```

(If your router has `git`, `git clone
https://github.com/xiphoideuz/openwrt-mc7500.git` works too — the layout
below is relative to the clone root.)

The package layout inside the repo:

```
Makefile                                   OpenWrt package (luci.mk)
htdocs/luci-static/resources/view/...      status.js + settings.js → /www/luci-static/...
root/usr/bin/zte_mc7500                    backend → /usr/bin/zte_mc7500
root/etc/init.d/zte-mc7500                  init script → /etc/init.d/
root/etc/config/zte_mc7500                  defaults → /etc/config/
root/usr/share/luci/menu.d/...              Modem → ZTE MC7500 menu entry
root/usr/share/rpcd/acl.d/...              file-exec + uci ACLs
po/template/zte-mc7500.po                  gettext template (English source)
```

Log out/in to LuCI (or clear the menu cache) and open
**Modem → ZTE MC7500**. Edit `/etc/config/zte_mc7500` (or use the
Configuration page) to match your modem IP/credentials.

### Option B — CLI only from GitHub (no LuCI)

Just the backend script — status, connect/disconnect, reboot and
scheduled-reboot cron management over SSH:

```sh
wget -O /usr/bin/zte_mc7500 \
  https://raw.githubusercontent.com/xiphoideuz/openwrt-mc7500/main/root/usr/bin/zte_mc7500
chmod +x /usr/bin/zte_mc7500
zte_mc7500 status
```

Without UCI it uses built-in defaults (modem at `192.168.254.1`); override
per-run with environment variables (see Configuration below) or install
the UCI config + init script from Option A for persistence and cron
support (`schedule` commands need UCI).

### Option C — build as an OpenWrt package

```sh
cp -r openwrt-mc7500 <openwrt-buildroot>/package/luci-app-zte-mc7500
# or into feeds: <openwrt-buildroot>/feeds/luci/applications/
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
	option sched_reboot '0'
	option sched_hour '4'
	option sched_minute '0'
```

| Option | Used by | Meaning |
|---|---|---|
| `ip` / `user` / `password` | LuCI + CLI | Modem web API endpoint and credentials |
| `refresh` | LuCI status page | Auto-refresh interval in seconds (min 5) |
| `cache` | CLI backend (`--cache`) | Serve cached JSON while younger than N seconds; 0 disables |
| `sched_reboot` / `sched_hour` / `sched_minute` | cron sync | Daily scheduled reboot, see above |

Environment variables `ZTE_IP` / `ZTE_USER` / `ZTE_PASS` override
both UCI and defaults when using the CLI — handy for the CLI-only
install or for pointing at a different unit for one run:

```sh
ZTE_IP=192.168.254.1 ZTE_USER=Admin ZTE_PASS=secret zte_mc7500 status
```

## Security notes

* The modem password is stored in clear text in UCI (root-readable only),
  same practice as other LuCI apps holding device credentials.
  **Change the modem's default password** in its own web UI, then update
  `/etc/config/zte_mc7500` (or the Configuration page) to match — and never
  commit your real password to git.
* Rebooting the ODU drops the mobile link for a few minutes.
* The LuCI pages assume an admin login; restricted users additionally need
  the `luci-app-zte-mc7500` ACL granted (see `root/usr/share/rpcd/acl.d/`).

## For agents

See [AGENTS.md](AGENTS.md) for architecture notes, target constraints
(BusyBox ash, no scp/python on the router) and the test/deploy loop.

## Credits

* View/menu/ACL layout inspired by
  [4IceG/luci-app-3ginfo-lite](https://github.com/4IceG/luci-app-3ginfo-lite)
  (itself forked from [obsy/modemdata](https://github.com/obsy/modemdata)).
* Signal-bar idea follows the koshev-msk calculation referenced there.

## License

GPL-3.0, see [LICENSE](LICENSE).
