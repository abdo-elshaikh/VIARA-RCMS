import importlib.util
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('setup_client', ROOT / 'viara-production-package/scripts/setup-client.py')
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)

class SetupTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.env = Path(self.directory.name) / '.env'
        self.initial = '\n'.join(key + '=' for key in setup.SITE_KEYS) + '\nENCRYPTION_KEY=keep-existing-key\nJWT_SECRET=keep-jwt\n'
        self.env.write_text(self.initial, encoding='utf-8')
        self.settings = dict(clinical_origin='https://clinical.example.test', portal_origin='https://portal.example.test', license_key='Synthetic_External_License', dicom_bind='192.168.1.20')
    def tearDown(self):
        self.directory.cleanup()
    def test_configuration_preserves_keys_and_sets_consistent_origins(self):
        setup.configure(self.settings, self.env)
        values = setup.read_env(self.env)
        self.assertEqual(values['ENCRYPTION_KEY'], 'keep-existing-key')
        self.assertEqual(values['JWT_SECRET'], 'keep-jwt')
        self.assertEqual(values['WEBAUTHN_RP_ID'], 'clinical.example.test')
        self.assertEqual(values['DOMAIN'], 'portal.example.test')
        self.assertEqual(values['ALLOWED_ORIGINS'], 'https://clinical.example.test,https://portal.example.test')
        self.assertNotIn(b'\r', self.env.read_bytes())
    def test_repeat_configuration_is_idempotent(self):
        setup.configure(self.settings, self.env)
        before = self.env.read_bytes()
        setup.configure(self.settings, self.env)
        self.assertEqual(before, self.env.read_bytes())
    def test_rejects_invalid_origins_without_changing_environment(self):
        for origin in ['http://clinical.example.test', 'https://localhost', 'https://clinical.example.test/path', 'https://user:pass@clinical.example.test', 'https://clinical.example.test?token=secret', 'https://clinical.example.test\nJWT_SECRET=altered']:
            with self.subTest(origin=origin):
                with self.assertRaises(ValueError):
                    setup.configure({**self.settings, 'clinical_origin': origin}, self.env)
                self.assertEqual(self.initial, self.env.read_text(encoding='utf-8'))
    def test_rejects_public_or_wildcard_dicom_bind(self):
        for bind in ['0.0.0.0', '8.8.8.8', '::1']:
            with self.subTest(bind=bind):
                with self.assertRaises(ValueError):
                    setup.configure({**self.settings, 'dicom_bind': bind}, self.env)
    def test_rejects_shared_origin_and_license_injection(self):
        for update in [{'portal_origin': self.settings['clinical_origin']}, {'license_key': 'key\nJWT_SECRET=changed'}]:
            with self.assertRaises(ValueError):
                setup.configure({**self.settings, **update}, self.env)
            self.assertEqual(self.initial, self.env.read_text(encoding='utf-8'))

if __name__ == '__main__':
    unittest.main()
