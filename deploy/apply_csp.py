import subprocess, shutil, sys

conf = "/etc/nginx/sites-enabled/hightable.pro"
bak = conf + ".bak.precsp"
shutil.copy2(conf, bak)
src = open(conf).read()

needle = '        add_header Cache-Control "no-cache";\n'
csp = (
    "object-src 'none'; base-uri 'self'; "
    "frame-ancestors 'self'; form-action 'self'"
)
inject = needle + (
    "        # Defense-in-depth (A11). object-src/base-uri/frame-ancestors/form-action only.\n"
    "        # script-src/style-src are intentionally NOT locked yet: index.html ships an inline\n"
    "        # error-bootstrap script and inline styles are used widely, so a full script-src CSP\n"
    "        # needs the cross-origin sandbox (roadmap B2) first.\n"
    '        add_header Content-Security-Policy "' + csp + '" always;\n'
    '        add_header X-Content-Type-Options "nosniff" always;\n'
)

n = src.count(needle)
if n != 2:
    print("ABORT: expected 2 Cache-Control no-cache blocks, found", n)
    sys.exit(1)

# Idempotency: do not double-apply
if "Content-Security-Policy" in src:
    print("CSP already present; nothing to do")
    sys.exit(0)

open(conf, "w").write(src.replace(needle, inject))
r = subprocess.run(["nginx", "-t"], capture_output=True, text=True)
print(r.stderr.strip())
if r.returncode != 0:
    shutil.copy2(bak, conf)
    print("nginx -t FAILED -> reverted to backup")
    sys.exit(1)
subprocess.run(["systemctl", "reload", "nginx"], check=True)
print("OK: CSP applied to 2 blocks + nginx reloaded")
