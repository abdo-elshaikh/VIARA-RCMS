# VIARA Clinical Remote Access — WireGuard
#
# WireGuard provides the clinical (Tier B) network: radiologist devices join a
# private 10.20.0.0/24 overlay and then reach `ris.example.org` behind mTLS.
# Do not expose the clinical HTTPS port to the public internet directly; only
# the WireGuard UDP port is opened, and only to known source networks.
#
# See docs/ and ../README.md for the full topology.

## 1. Generate keys

```bash
# Server
umask 077
wg genkey | tee server.key | wg pubkey > server.pub

# Each device (repeat per radiologist workstation)
wg genkey | tee rad-01.key | wg pubkey > rad-01.pub
```

Store `server.key` in the host secret store (e.g. root-only file or a secrets
manager). Never commit any `*.key`, only the `.example` files in this directory.

## 2. Server configuration

Install `wg0.conf.example` as `/etc/wireguard/wg0.conf`, replace the keys, and
add one `[Peer]` block per device (see `peer-client.conf.example`).

```bash
sudo install -m 0600 wg0.conf.example /etc/wireguard/wg0.conf
sudo systemctl enable --now wg-quick@wg0
sudo wg show
```

Firewall (example, using UFW):

```bash
# Open only the WireGuard port, only from your management/known networks.
sudo ufw allow from <ADMIN_OR_KNOWN_CIDR> to any port 51820 proto udp
# Clinical HTTPS must NOT be opened publicly; it is reached over wg0 only.
# DICOM 4242 remains restricted to the modality VLAN (see compose/env).
```

## 3. Device provisioning

For each device:

1. Add its public key as a `[Peer]` in `/etc/wireguard/wg0.conf` with a unique
   `AllowedIPs = 10.20.0.<n>/32`.
2. Install `peer-client.conf.example` on the device as `wg0.conf`, filling in
   the server public key and endpoint.
3. Issue the device an **mTLS client certificate** from the clinical CA and
   enroll it in the OS/ browser trust store. The nginx `ssl_verify_client on`
   in `../nginx/clinical-edge.conf` will reject any device without it.
4. Verify: `wg show` on the server and a `curl` to the clinical hostname from
   the device.

## 4. Revocation

- Revoke a WireGuard peer by removing its `[Peer]` block and reloading
  (`wg syncconf wg0 <(wg-quick strip wg0)`).
- Revoke its mTLS certificate through your CA's CRL/OCSP. If you enabled
  `ssl_crl` in the clinical edge, nginx rejects revoked devices immediately.
- Disabling the VIARA user account also invalidates any live viewer session
  (server-side check), but device revocation is a separate, network-level action.

## 5. Notes

- `AllowedIPs` on the client is intentionally narrow: route only the clinical
  subnet, not all traffic, so split-tunnel keeps personal traffic off the tunnel
  and reduces exposure.
- Keep `MTU` conservative (1280–1420) if devices traverse consumer networks.
- Audit peer usage (`wg show` history / your SIEM) and remove stale peers.