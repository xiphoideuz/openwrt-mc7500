# AGENTS.md — instructions for AI coding agents working on luci-app-zte-mc7500

Read this before changing anything. The companion `README.md` is the
user-facing doc; this file is the maintainer/contributor contract.

## What this project is

LuCI (JS) app + shell backend that manages a **ZTE MC7500 5G outdoor unit**
through its HTTPS ubus JSON-RPC API (`https://<modem-ip>/ubus/`), proxied via
the OpenWrt router. Layout mirrors
[4IceG/luci-app-3ginfo-lite](https://github.com/4IceG/luci-app-3ginfo-lite).

```
Makefile                                     OpenWrt package (luci.mk)
htdocs/luci-static/resources/view/zte_mc7500/
  status.js                                  auto-refresh status + reboot button
  settings.js                                form.Map over UCI config
root/etc/config/zte_mc7500                   defaults (ip/user/password/refresh/cache)
root/usr/bin/zte_mc7500                      backend: login → query → JSON (also a standalone CLI)
root/usr/share/luci/menu.d/…                 Modem → ZTE MC7500 menu
root/usr/share/rpcd/acl.d/…                  file-exec + uci ACLs
po/template/zte-mc7500.po                    gettext template (English source)
```

## Modem API essentials (reverse-engineered, do not guess — verify on device)

* Base `https://<ip>/ubus/?t=<millis>`, POST JSON array of
  `{"jsonrpc":"2.0","id":N,"method":"call","params":[stok, obj, method, args]}`.
* Requests **must** carry `Z-Mode` (0 pre-login, 1 after), `Z-Tag` (= method),
  `Referer`, `Origin`, `X-Requested-With` headers, otherwise the modem 307s
  to `/` with body `0`. Cookies (`webtoken`) must persist across calls.
* Login: `zwrt_web/web_login_info` → `zte_web_sault` (+ fail counters) →
  `password = SHA256(SHA256(pass) + sault)` in **UPPERCASE** hex (matches the
  modem's own JS: `"0123456789ABCDEF"`) → `zwrt_web/web_login` →
  `ubus_rpc_session` becomes `stok`. Logout: `zwrt_web/web_logout`.
* Status reads: `zwrt_router.api/router_get_status`,
  `zte_nwinfo_api/nwinfo_get_netinfo`, `zwrt_zte_mdm.api/get_sim_info`,
  `zwrt_data/get_wwaniface`, `zwrt_data/get_wwandst{type:4}`,
  `zwrt_mc.device.manager/get_device_info{}`,
  `zwrt_data/get_wwandst_monthlimit` + `get_wwandst_clearday` (data plan).
* Data session: `zwrt_data/set_wwaniface{source_module:"web",cid:1,enable:1|0}`.
  **Taking the session down invalidates the web session** (next call fails
  with `-32002`); the backend therefore uses `ubus_auth()` (re-login +
  one retry) for state-changing calls. `get_wwaniface.connect_status` is
  `ipv4_ipv6_connected` when up, `disconnected` when down.
* Reboot: `zwrt_mc.device.manager/device_reboot{"moduleName":"web"}`.
  Success = `result[0] == 0`. The ODU is down ~2–4 min afterwards.
* Data-plan math (must match the modem's Data Management page):
  `used = month_rx_bytes + month_tx_bytes`, plan `value` is **bytes**,
  `type:2` = data plan, `type:1` = time plan (value in seconds),
  `ratio` = alert percent.
* Radio policy (Advanced page / `bands`, `bandlock`, … commands):
  reads come from `zte_nwinfo_api/nwinfo_get_netinfo` (`lte_band` as
  comma list, `lte_band_lock` as hex mask, `nr5g_sa/nsa/nrdc_band_lock`,
  `net_select`, `net_select_mode`, `lock_lte/nr_cell`) plus
  `uci get {config:"zte_nwinfo",section:"odu_as_mode"}` for the antenna
  and `zwrt_apn_object/getApnAtCid{cid:1}` for the APN (view-only: the
  modem AES-encrypts the APN password in JS, unreproducible in shell).
  Writes (all verified with read-back, all invalidate the status cache):
  `nwinfo_set_lte_ext_band{lte_band}`, `nwinfo_set_sa_bandlock`
  (`{nr5g_sa_band_lock}` for SA, `{nr5g_band,nr5g_type:"1"}` for NSA),
  `nwinfo_reset_band_cell_setting{}` (full auto reset),
  `nwinfo_set_netselect{net_select}` (WL_AND_5G/LTE_AND_5G/Only_5G/Only_LTE/NETWORK_auto),
  `nwinfo_set_odu_as_mode{odu_as_mode}` (auto/front_directional/rear_directional/omni).
  **Writes kick the web session** (next call → `-32002`) and may make the
  modem re-register (link flap); `ubus_auth()` covers the former, confirm
  modals + read-back cover the latter. Named states live in the flatfile
  `/etc/zte_mc7500.states` (`name|epoch|lte|sa|nsa|net|ant`), not UCI.
  (There is also a legacy goform transport — `[{goformId:…}]` POSTed to
  `/ubus` — but every control above has a pure-ubus setter, so the
  backend doesn't need it.)

## Hard constraints (the router is BusyBox ash, not bash)

* Backend must stay POSIX `sh`: **no bashisms** (`[[`, arrays, `local` is OK
  in ash but keep style), no `grep -P`, no `stat` (applet missing),
  no `base64`/`openssl`/`python3` on target. Tools guaranteed:
  `curl`, `sha256sum` (busybox), `jsonfilter`, `awk`, `sed`, `tr`, `uci`.
* Status JSON `meta` carries `generated` (epoch) and `cached` (bool):
  fresh queries stamp both, cache hits flip `cached` to true via sed so
  the LuCI footer can show live-vs-cache age. `status --json` stdout must
  stay **pure JSON** (logs → stderr).
  Exit codes: `0` ok, `1` error, `3` reserved. Keep `--version` in sync
  with `PKG_VERSION` in `Makefile`.
* LuCI JS: only stock-resource APIs (`view/fs/ui/uci/poll/form`).
  Wrap every string shown to users in `_('…')` and add it to
  `po/template/zte-mc7500.po` (check with the lint workflow).
* Every DOM id read in `status.js` (`getElementById`/`setText`/`setBar`)
  must be created in `render()` (directly or via `row2()`); the CI
  cross-check enforces this.
* Never commit real credentials. `root/etc/config/zte_mc7500` ships
  factory-style defaults; do not put user-specific passwords in git.

## Test / deploy loop (no scp/sftp-server on target, no base64 either)

Router is at `172.22.88.1` as `root` (key auth, no password needed):

```sh
sh -n root/usr/bin/zte_mc7500
node --check htdocs/luci-static/resources/view/zte_mc7500/status.js
node --check htdocs/luci-static/resources/view/zte_mc7500/settings.js
python3 -c "import json; json.load(open('root/usr/share/luci/menu.d/luci-app-zte-mc7500.json')); json.load(open('root/usr/share/rpcd/acl.d/luci-app-zte-mc7500.json'))"

# deploy one file (repeat per file; cat-redirect preserves content, chmod after)
ssh root@172.22.88.1 'cat > /dest/path' < src/path
ssh root@172.22.88.1 'chmod +x /usr/bin/zte_mc7500; /etc/init.d/rpcd restart; rm -rf /tmp/luci-*'
```

Smoke tests on the router:

```sh
zte_mc7500 --version
zte_mc7500 status --json --cache 60 | head -c 200   # uses /etc/config, no env needed
zte_mc7500 schedule show
zte_mc7500 bands && zte_mc7500 apn | head -3
zte_mc7500 states list
zte_mc7500 connect | disconnect | reconnect   # flaps WAN - warn first
# radio writes below are no-ops when given current values (safe self-test):
zte_mc7500 bandlock lte "$(zte_mc7500 bands --json | jsonfilter -e '@.lte_band')"
ubus call file exec '{"command":"/usr/bin/zte_mc7500","params":["status","--json","--cache","60"]}'
uci show zte_mc7500
curl -s -o /dev/null -w '%{http_code}\n' http://172.22.88.1/luci-static/resources/view/zte_mc7500/status.js
```

Scheduled reboot plumbing: UCI `sched_reboot/sched_hour/sched_minute` →
`zte_mc7500 schedule apply` (via `/etc/init.d/zte-mc7500 reload` or the
settings-page button) → marked block in `/etc/crontabs/root` → visible in
System → Scheduled Tasks. Never hand-edit the block; re-running apply is
idempotent (verified byte-identical no-op).

Full `status` (no `--cache`) does a fresh modem login + ~8 RPC calls.
`restart` reboots the ODU: expect the router's WAN (and ZeroTier SSH
to it) to drop for a few minutes — warn before running it.
A real browser render test is not available in this environment; after
deploying, verify **Modem → ZTE MC7500** manually in LuCI.

## Release checklist

1. Bump `VERSION=` in `root/usr/bin/zte_mc7500` **and** `PKG_VERSION` in `Makefile`.
2. Update `README.md` (features/config/changelog if behaviour changed).
3. Run the full lint workflow steps locally (see `.github/workflows/lint.yml`).
4. Redeploy backend to the test router, run smoke tests above.
5. Commit; tag `vX.Y.Z` for releases built with the OpenWrt SDK.
