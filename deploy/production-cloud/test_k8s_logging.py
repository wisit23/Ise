"""Offline subprocess logging tests; no Docker, cluster or network access."""
import contextlib
import importlib.util
import io
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

spec = importlib.util.spec_from_file_location("k8s_logging", Path(__file__).with_name("k8s-production.py"))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class LoggingTests(unittest.TestCase):
    def setUp(self):
        self.log = tempfile.TemporaryFile()
        self.addCleanup(self.log.close)
        self.log_patch = patch.object(m, "LOG", self.log)
        self.log_patch.start()
        self.addCleanup(self.log_patch.stop)
        self.screen = io.StringIO()

    def logged(self):
        self.log.seek(0)
        return self.log.read()

    def command(self, code, **kwargs):
        with contextlib.redirect_stdout(self.screen):
            return m.run([sys.executable, "-c", code], **kwargs)

    def test_stdout_stderr_are_displayed_and_saved(self):
        self.command("import os; os.write(1,b'build progress'); os.write(2,b' warning\\n')")
        self.assertEqual(self.screen.getvalue(), "build progress warning\n")
        self.assertEqual(self.logged(), b"build progress warning\n")

    def test_progress_is_visible_before_wait_and_split_utf8_is_preserved(self):
        process = MagicMock()
        process.__enter__.return_value = process
        process.stdout.read1.side_effect = [b"progress ", b"\xe0\xb9", b"\x84", b""]

        def finished():
            self.assertEqual(self.screen.getvalue(), "progress ไ")
            return 0

        process.wait.side_effect = finished
        with patch.object(m.subprocess, "Popen", return_value=process):
            self.command("unused")
        self.assertEqual(self.logged(), "progress ไ".encode())

    def test_capture_stays_private_and_returns_output(self):
        result = self.command("import os; os.write(1,b'private-config'); os.write(2,b'private-diagnostic')", capture=True)
        self.assertEqual(result, "private-config")
        self.assertEqual(self.screen.getvalue(), "")
        self.assertEqual(self.logged(), b"private-diagnostic")

    def test_binary_output_stays_in_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "backup"
            self.command("import os; os.write(1,bytes([0,255,1])); os.write(2,b'backup diagnostic')", output=path)
            self.assertEqual(path.read_bytes(), bytes([0, 255, 1]))
        self.assertEqual(self.screen.getvalue(), "")
        self.assertEqual(self.logged(), b"backup diagnostic")

    def test_failure_keeps_exit_code_without_echoing_arguments(self):
        with self.assertRaises(m.Blocked) as error:
            self.command("import os, sys; os.write(1,b'failed step\\n'); sys.exit(7)")
        self.assertIn("exit 7", str(error.exception))
        self.assertNotIn("import sys", str(error.exception))
        self.assertEqual(self.screen.getvalue(), "failed step\n")
        self.assertEqual(self.logged(), b"failed step\n")

    def test_large_stdin_and_output_do_not_deadlock_or_echo_input(self):
        self.command("import os, sys; sys.stdout.write('x'*200000); sys.stdout.flush(); data=sys.stdin.buffer.read(); os.write(1,(str(len(data))+'\\n').encode())", data=b"private" * 100000)
        expected = "x" * 200000 + "700000\n"
        self.assertEqual(self.screen.getvalue(), expected)
        self.assertEqual(self.logged(), expected.encode())


if __name__ == "__main__":
    unittest.main()
