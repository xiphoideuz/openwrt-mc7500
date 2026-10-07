#
# Copyright 2026 - luci-app-zte-mc7500
#
# Licensed to the GNU General Public License v3.0.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-zte-mc7500
LUCI_TITLE:=LuCI support for ZTE MC7500 5G ODU
MAINTAINER:=luci-app-zte-mc7500 contributors
LUCI_DESCRIPTION:=LuCI interface for the ZTE MC7500 5G outdoor unit. Shows radio, SIM, WAN and data-plan status and allows rebooting the unit.
LUCI_DEPENDS:=+curl
LUCI_PKGARCH:=all
PKG_VERSION:=1.2.0
PKG_RELEASE:=1

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
