import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
from unittest.mock import patch

import pull_requests as pull
from test_release import manifest


class PullRequestTests(unittest.TestCase):
    def setUp(self):
        self.release = manifest()
        self.release['run_url'] = 'https://github.com/wisit23/Ise/actions/runs/20'
        self.raw = json.dumps(self.release).encode()
        self.request = {'version': 1, 'environment': 'production', 'deploy_run_id': 30,
                        'run_attempt': 1, 'release_run_id': 20, 'mode': 'promote', 'migrate': False,
                        'manifest_sha256': hashlib.sha256(self.raw).hexdigest()}
        tag = 'production-request-30-1'
        self.item = {'tag_name': tag, 'draft': False, 'prerelease': False, 'assets': [
            {'name': 'deployment-input.zip', 'size': 1000,
             'browser_download_url': f'https://github.com/wisit23/Ise/releases/download/{tag}/deployment-input.zip'}]}

    def archive(self):
        output = io.BytesIO()
        with zipfile.ZipFile(output, 'w') as archive:
            archive.writestr('request.json', json.dumps(self.request))
            archive.writestr('release.json', self.raw)
        return output.getvalue()

    def workflow(self, path, event):
        return {'path': path, 'event': event, 'head_branch': 'main', 'status': 'completed',
                'conclusion': 'success', 'repository': {'full_name': 'wisit23/Ise'},
                'head_repository': {'full_name': 'wisit23/Ise'}}

    def responses(self, archive):
        ci = self.workflow('.github/workflows/ci.yml', 'push')
        ci['head_sha'] = self.release['commit']
        return [self.workflow('.github/workflows/deploy.yml', 'workflow_dispatch'),
                {'artifacts': [{'name': 'approved-production-request-1', 'expired': False,
                                'workflow_run': {'id': 30}, 'digest': 'sha256:' + hashlib.sha256(archive).hexdigest()}]},
                self.workflow('.github/workflows/release.yml', 'workflow_run'), {'workflow_runs': [ci]}]

    def validate(self):
        archive = self.archive()
        with patch.object(pull, 'read_url', return_value=archive), \
                patch.object(pull, 'api', side_effect=self.responses(archive)):
            return pull.validate_request(self.item)

    def test_approved_request_checks_workflows_checksum_and_manifest(self):
        request, raw = self.validate()
        self.assertEqual(request, self.request)
        self.assertEqual(raw, self.raw)

    def test_tampered_assets_and_migration_rollback_are_rejected(self):
        self.request['manifest_sha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'checksum'):
            self.validate()
        self.request['mode'], self.request['migrate'] = 'rollback', True
        with self.assertRaisesRegex(ValueError, 'Rollback'):
            self.validate()

    def test_untrusted_or_unsuccessful_workflows_are_rejected(self):
        for change in ({'conclusion': 'failure'}, {'event': 'pull_request'}, {'head_branch': 'other'},
                       {'head_repository': {'full_name': 'attacker/Ise'}}, {'path': '.github/workflows/other.yml'}):
            with self.subTest(change=change):
                run = self.workflow('.github/workflows/deploy.yml', 'workflow_dispatch')
                run.update(change)
                with self.assertRaises(ValueError):
                    pull.check_run(run, '.github/workflows/deploy.yml', 'workflow_dispatch')

    def test_foreign_or_duplicate_assets_are_rejected(self):
        self.item['assets'][0]['browser_download_url'] = 'https://attacker.test/request.json'
        with self.assertRaisesRegex(ValueError, 'asset'):
            self.validate()
        self.item['assets'] = [self.item['assets'][0]] * 2
        with self.assertRaisesRegex(ValueError, 'assets'):
            self.validate()

    def test_missing_successful_push_ci_is_rejected(self):
        archive = self.archive()
        responses = self.responses(archive)
        responses[-1] = {'workflow_runs': []}
        with patch.object(pull, 'read_url', return_value=archive), \
                patch.object(pull, 'api', side_effect=responses), self.assertRaisesRegex(ValueError, 'push CI'):
            pull.validate_request(self.item)

    def test_mutable_release_asset_cannot_replace_the_approved_artifact(self):
        archive = self.archive()
        responses = self.responses(archive)
        self.request['mode'] = 'rollback'
        with patch.object(pull, 'read_url', return_value=self.archive()), \
                patch.object(pull, 'api', side_effect=responses), self.assertRaisesRegex(ValueError, 'Immutable'):
            pull.validate_request(self.item)

    def test_artifact_from_another_run_is_rejected(self):
        archive = self.archive()
        responses = self.responses(archive)
        responses[1]['artifacts'][0]['workflow_run']['id'] = 31
        with patch.object(pull, 'api', side_effect=responses), self.assertRaisesRegex(ValueError, 'another workflow'):
            pull.validate_request(self.item)

    def test_successful_request_is_not_deployed_twice(self):
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory) / 'request.json'
            with patch.object(pull, 'api', return_value=[self.item]), \
                    patch.object(pull, 'validate_request', return_value=(self.request, self.raw)), \
                    patch.object(pull.subprocess, 'run') as deploy:
                pull.consume({}, state)
                pull.consume({}, state)
                deploy.assert_called_once()
                self.assertEqual(json.loads(state.read_text())['status'], 'success')

    def test_failed_request_is_recorded_and_never_automatically_retried(self):
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory) / 'request.json'
            with patch.object(pull, 'api', return_value=[self.item]), \
                    patch.object(pull, 'validate_request', return_value=(self.request, self.raw)), \
                    patch.object(pull.subprocess, 'run', side_effect=RuntimeError('deployment failed')) as deploy:
                with self.assertRaises(RuntimeError):
                    pull.consume({}, state)
                self.assertEqual(json.loads(state.read_text())['status'], 'failed')
                pull.consume({}, state)
                deploy.assert_called_once()


if __name__ == '__main__':
    unittest.main()
