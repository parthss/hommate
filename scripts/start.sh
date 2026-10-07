#!/data/data/com.termux/files/usr/bin/bash
# Start Hommate on the tablet and keep it running.
# - Holds a wake lock so Android doesn't put Termux to sleep.
# - Restarts the server if it ever crashes.
# - Starts the Cloudflare Tunnel too, if you've saved a token in ~/.hommate-tunnel-token
cd "$(dirname "$0")/.." || exit 1
termux-wake-lock 2>/dev/null

if [ -f "$HOME/.hommate-tunnel-token" ] && ! pgrep -f "cloudflared tunnel" >/dev/null; then
  nohup cloudflared tunnel --no-autoupdate run --token "$(cat "$HOME/.hommate-tunnel-token")" > "$HOME/cloudflared.log" 2>&1 &
fi

while true; do
  echo "$(date) starting Hommate" >> "$HOME/hommate.log"
  node --disable-warning=ExperimentalWarning server/server.js >> "$HOME/hommate.log" 2>&1
  echo "$(date) Hommate stopped (exit $?), restarting in 5s" >> "$HOME/hommate.log"
  sleep 5
done
