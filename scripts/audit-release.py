from pathlib import PurePosixPath
import sys, zipfile

with zipfile.ZipFile(sys.argv[1]) as archive:
    paths = archive.namelist()
    forbidden = {'念念资料', 'tasks.json', 'notes-sync.json', 'reminders-sync.json', 'notes-format-current.json', '.env', 'notes-backups', 'notes-before-reminders'}
    for path in paths:
        parts = PurePosixPath(path).parts
        if any(part in forbidden for part in parts) or '..' in parts or path.startswith('/'):
            raise SystemExit('Private state or unsafe path in release: ' + path)
    if not any(path.endswith('念念.app/Contents/MacOS/applet') for path in paths):
        raise SystemExit('Missing application executable')
    if '念念/先看这里.txt' not in paths:
        raise SystemExit('Missing first-use guide')
print('PASS: executable and first-use guide present; no task state or private sync files')
