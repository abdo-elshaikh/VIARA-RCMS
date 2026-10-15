#!/usr/bin/env python3
"""Client configuration only; never evaluates .env or prints credentials."""
import argparse
import getpass
import ipaddress
import json
import os
import re
import tempfile
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
SITE_KEYS = ('CLIENT_URL', 'PORTAL_CLIENT_URL', 'PORTAL_PUBLIC_URL', 'ALLOWED_ORIGINS',
             'WEBAUTHN_ORIGIN', 'WEBAUTHN_RP_ID', 'DOMAIN', 'LICENSE_KEY', 'PACS_DICOM_BIND')

def origin(value):
    parsed = urlsplit(value)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError('Use an HTTPS origin without credentials.')
    if parsed.path not in ('', '/') or parsed.query or parsed.fragment:
        raise ValueError('Enter an origin only, without a path, query or fragment.')
    if parsed.hostname in ('localhost', '127.0.0.1', '0.0.0.0', '::1'):
        raise ValueError('Use the customer HTTPS hostname.')
    # Validate the port and prohibit characters that can alter dotenv parsing.
    if parsed.port == 0 or not re.fullmatch(r'[A-Za-z0-9.-]+', parsed.hostname):
        raise ValueError('Use an ASCII hostname or IPv4 address and a valid HTTPS port.')
    if any(c in value for c in '\r\n\"\'#\\') or re.search(r'\s', value):
        raise ValueError('Invalid hostname or URL characters.')
    return value.rstrip('/'), parsed.hostname

def read_env(path):
    result = {}
    for line in path.read_text(encoding='utf-8-sig').splitlines():
        if line and not line.startswith('#') and '=' in line:
            key, value = line.split('=', 1)
            if key in result:
                raise ValueError('Duplicate environment setting: ' + key)
            result[key] = value
    return result

def configure(settings, env_path):
    staff, staff_host = origin(settings['clinical_origin'])
    portal, portal_host = origin(settings['portal_origin'])
    if staff == portal:
        raise ValueError('Clinical and public portal origins must be distinct.')
    license_key = settings['license_key'].strip()
    if not re.fullmatch(r'[A-Za-z0-9_+/=-]+', license_key):
        raise ValueError('Supply the vendor-issued license key, without whitespace.')
    bind = settings.get('dicom_bind', '127.0.0.1').strip()
    address = ipaddress.ip_address(bind)
    if address.version != 4 or address.is_unspecified or not (address.is_private or address.is_loopback):
        raise ValueError('DICOM binding must be a specific private IPv4 interface.')
    values = {
        'CLIENT_URL': staff, 'PORTAL_CLIENT_URL': portal, 'PORTAL_PUBLIC_URL': portal,
        'ALLOWED_ORIGINS': staff + ',' + portal, 'WEBAUTHN_ORIGIN': staff,
        'WEBAUTHN_RP_ID': staff_host, 'DOMAIN': portal_host, 'LICENSE_KEY': license_key,
        'PACS_DICOM_BIND': bind,
    }
    existing = read_env(env_path)
    if any(key not in existing for key in SITE_KEYS):
        raise ValueError('The environment template is incomplete.')
    content = env_path.read_text(encoding='utf-8-sig')
    updated = '\n'.join(
        line.split('=', 1)[0] + '=' + values[line.split('=', 1)[0]]
        if '=' in line and line.split('=', 1)[0] in values else line
        for line in content.splitlines()
    ) + '\n'
    # Same-directory atomic replacement; all cryptographic keys are preserved.
    descriptor, temporary = tempfile.mkstemp(prefix='.setup-', dir=env_path.parent)
    try:
        os.fchmod(descriptor, 0o600) if hasattr(os, 'fchmod') else None
        with os.fdopen(descriptor, 'w', encoding='utf-8', newline='\n') as stream:
            stream.write(updated)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, env_path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--settings-file', type=Path)
    parser.add_argument('--env-file', type=Path, default=ROOT / '.env')
    args = parser.parse_args()
    if args.settings_file:
        settings = json.loads(args.settings_file.read_text(encoding='utf-8-sig'))
    else:
        print('VIARA customer setup / إعداد العميل')
        settings = {
            'clinical_origin': input('Clinical HTTPS origin / رابط الموظفين: ').strip(),
            'portal_origin': input('Patient portal HTTPS origin / رابط البوابة: ').strip(),
            'license_key': getpass.getpass('Vendor license key / الترخيص (hidden): '),
            'dicom_bind': input('DICOM private LAN IPv4 [127.0.0.1]: ').strip() or '127.0.0.1',
        }
    configure(settings, args.env_file)
    print('Site configured. Existing encryption keys preserved. License is verified at server startup.')

if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError) as error:
        print('Setup failed: ' + str(error))
        raise SystemExit(1)
