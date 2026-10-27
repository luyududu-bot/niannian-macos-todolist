from pathlib import Path
import sys, zipfile
source, destination = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
if not source.is_dir() or destination.is_relative_to(source):
    raise SystemExit('Choose a package directory and an archive outside it')
with zipfile.ZipFile(destination, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(source.rglob('*')):
        if path.is_symlink():
            raise SystemExit('Unexpected symbolic link in release: ' + str(path))
        if path.is_file():
            archive.write(path, str(Path(source.name) / path.relative_to(source)))
print('Packaged UTF-8 filenames and executable permissions:', destination.name)
