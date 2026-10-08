#
# Licensed to the PolyForm Noncommercial License v1.0.0.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-zte-mc7500
LUCI_TITLE:=LuCI support for ZTE MC7500 5G ODU
MAINTAINER:=luci-app-zte-mc7500 contributors
LUCI_DESCRIPTION:=LuCI interface for the ZTE MC7500 5G outdoor unit. Shows radio, SIM, WAN and data-plan status and allows rebooting the unit.
LUCI_DEPENDS:=+curl
LUCI_PKGARCH:=all
PKG_VERSION:=1.3.1
PKG_RELEASE:=1

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
