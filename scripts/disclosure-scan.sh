#!/usr/bin/env bash
#
# Authored-tree disclosure / secrets gate (spec quickstart.md §9).
#
# Runs over an allowlist of every path this project authors and fails if any
# tracked file carries an IPv4 literal, a `:port` sequence, an absolute host
# path, a PEM private-key header, or an Argon2 PHC hash. Also confirms
# PRIVATE-CONTEXT.md is ignored and untracked.
#
# `ghcr.io/magpern/homemedia-portal` (the portal's own public image name) is
# expected and not a violation. Any other hit is reviewed and resolved before
# commit; concrete infrastructure values belong only in untracked
# PRIVATE-CONTEXT.md. The vendored Spec Kit tooling under `.specify/` and
# `.claude/` is third-party and reviewed on upgrades, not here.
set -u

status=0

if git grep -nIE \
  -e '([0-9]{1,3}[.]){3}[0-9]{1,3}' \
  -e '[:][0-9]{2,5}([^0-9]|$)' \
  -e '(^|[[:space:]"()])[/](srv|etc|opt|mnt|var/run)[/]' \
  -e '[-]{5}BEGIN [A-Z ]*PRIVATE KEY' \
  -e '[$]argon2(id|i|d)[$]' \
  -- 'specs/' 'src/' 'tests/' 'docs/' 'scripts/' '.github/' 'README.md' 'Dockerfile' 'compose*.y*ml'
then
  echo 'REVIEW: potential disclosure/secret above'
  status=1
else
  echo 'authored-tree clean'
fi

if git check-ignore -q PRIVATE-CONTEXT.md; then
  echo 'PRIVATE-CONTEXT.md ignored ok'
else
  echo 'PRIVATE-CONTEXT.md is NOT ignored'
  status=1
fi

if git ls-files | grep -qi 'private-context'; then
  echo 'LEAK: a private-context file is tracked'
  status=1
else
  echo 'private-context not tracked ok'
fi

exit "$status"
