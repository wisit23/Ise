"""Real local Git repositories; no network, Docker, Kubernetes or user-repo mutations."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


def shell():
    if os.name == "nt":
        candidate = Path("C:/Program Files/Git/bin/bash.exe")
        return str(candidate) if candidate.exists() else None
    return shutil.which("bash")


@unittest.skipUnless(shell() and shutil.which("git"), "Git and Bash required")
class GitUpdateTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.remote = self.base / "origin.git"
        self.writer = self.base / "writer"
        self.checkout = self.base / "server"
        self.env = dict(os.environ, GIT_CONFIG_NOSYSTEM="1", GIT_CONFIG_GLOBAL=os.devnull)
        self.git(self.base, "init", "--bare", "--initial-branch=main", str(self.remote))
        self.git(self.base, "clone", str(self.remote), str(self.writer))
        self.identity(self.writer)
        directory = self.writer / "deploy/production-cloud"
        directory.mkdir(parents=True)
        for name in ("deploy-k8s.sh", "git-update.sh", "k8s-production.py", "k8s-fresh.py"):
            (directory / name).write_text("initial\n")
        (self.writer / "app.txt").write_text("version1\n")
        self.commit(self.writer, "initial")
        self.git(self.writer, "push", "origin", "main")
        self.git(self.base, "clone", str(self.remote), str(self.checkout))
        self.identity(self.checkout)
        self.initial = self.git(self.checkout, "rev-parse", "HEAD").strip()

    def git(self, cwd, *arguments):
        return subprocess.check_output(["git", "-C", str(cwd), *arguments], env=self.env,
                                       stderr=subprocess.STDOUT, text=True)

    def identity(self, directory):
        for key, value in (("user.name", "Deploy test"), ("user.email", "deploy@example.invalid"),
                           ("commit.gpgsign", "false"), ("core.autocrlf", "false")):
            self.git(directory, "config", key, value)

    def commit(self, directory, message):
        self.git(directory, "add", ".")
        self.git(directory, "commit", "-m", message)

    def update_remote(self):
        (self.writer / "app.txt").write_text("version2\n")
        self.commit(self.writer, "update")
        self.git(self.writer, "push", "origin", "main")

    def update(self):
        helper = Path(__file__).with_name("git-update.sh").resolve().as_posix()
        return subprocess.run([shell(), "-c", 'set -Eeuo pipefail; cd -- "$1"; root=$(pwd); source "$2"; k8s_update_checkout "$root"',
                               "test", self.checkout.as_posix(), helper], env=self.env,
                              capture_output=True, text=True)

    def test_clean_main_fast_forwards_to_remote_commit(self):
        self.update_remote()
        result = self.update()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.checkout / "app.txt").read_text(), "version2\n")
        self.assertEqual(self.git(self.checkout, "rev-parse", "HEAD"), self.git(self.writer, "rev-parse", "HEAD"))

    def test_no_remote_change_succeeds_without_changing_commit(self):
        result = self.update()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.git(self.checkout, "rev-parse", "HEAD").strip(), self.initial)

    def test_dirty_tracked_file_is_preserved_without_updating_head(self):
        self.update_remote()
        (self.checkout / "app.txt").write_text("local work\n")
        result = self.update()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("local changes", result.stderr)
        self.assertEqual((self.checkout / "app.txt").read_text(), "local work\n")
        self.assertEqual(self.git(self.checkout, "rev-parse", "HEAD").strip(), self.initial)

    def test_untracked_file_is_preserved_and_blocks_update(self):
        (self.checkout / "unsaved.txt").write_text("keep")
        result = self.update()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.checkout / "unsaved.txt").read_text(), "keep")

    def test_local_commit_ahead_is_not_deployed_as_remote_main(self):
        (self.checkout / "local.txt").write_text("local")
        self.commit(self.checkout, "local commit")
        before = self.git(self.checkout, "rev-parse", "HEAD")
        result = self.update()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("local commits", result.stderr)
        self.assertEqual(self.git(self.checkout, "rev-parse", "HEAD"), before)

    def test_diverged_history_is_not_merged_or_reset(self):
        self.update_remote()
        (self.checkout / "app.txt").write_text("local commit\n")
        self.commit(self.checkout, "diverged")
        result = self.update()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("diverges", result.stderr)
        self.assertEqual((self.checkout / "app.txt").read_text(), "local commit\n")

    def test_wrong_branch_is_rejected(self):
        self.git(self.checkout, "checkout", "-b", "feature")
        result = self.update()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("must be on main", result.stderr)

    def test_fetch_failure_does_not_update_head(self):
        self.git(self.checkout, "remote", "remove", "origin")
        result = self.update()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.git(self.checkout, "rev-parse", "HEAD").strip(), self.initial)

    def test_remote_env_file_cannot_replace_machine_configuration(self):
        # An ignored local file must survive a remote commit trying to track that path.
        for directory in (self.writer, self.checkout):
            (directory / ".git/info/exclude").write_text(".env\n")
        (self.checkout / ".env").write_text("MACHINE_LOCAL=value\n")
        (self.writer / ".env").write_text("REMOTE=value\n")
        self.git(self.writer, "add", "--force", ".env")
        self.git(self.writer, "commit", "-m", "track env")
        self.git(self.writer, "push", "origin", "main")
        result = self.update()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("machine-local .env", result.stderr)
        self.assertEqual((self.checkout / ".env").read_text(), "MACHINE_LOCAL=value\n")
        self.assertEqual(self.git(self.checkout, "rev-parse", "HEAD").strip(), self.initial)


if __name__ == "__main__":
    unittest.main()
