import contextlib
import importlib.util
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

class ConfigTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        spec=importlib.util.spec_from_file_location('config',Path(__file__).parents[1]/'configure-public-url.py')
        self.module=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.module);self.module.ROOT=self.root
    def tearDown(self):self.tmp.cleanup()
    def test_url_keeps_secret_and_permissions(self):
        p=self.root/'.env';p.write_text("DEVICE_API_KEY='test-only-configuration-key-123456789'\n")
        with patch('sys.argv',['configure-public-url.py','http://192.168.1.20:6017']),contextlib.redirect_stdout(io.StringIO()):self.assertEqual(self.module.main(),0)
        self.assertIn("DEVICE_API_KEY='test-only-configuration-key-123456789'",p.read_text())
        self.assertIn('BIERPETER_PUBLIC_URL',p.read_text());self.assertEqual(p.stat().st_mode&0o777,0o600)
    def test_loopback_rejected_without_writing(self):
        with patch('sys.argv',['configure-public-url.py','http://127.0.0.1:6017']),contextlib.redirect_stdout(io.StringIO()):self.assertEqual(self.module.main(),1)
        self.assertFalse((self.root/'.env').exists())
