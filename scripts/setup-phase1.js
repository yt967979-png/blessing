const { Client } = require('ssh2');

function runRemoteCommand(conn, cmd) {
  return new Promise((resolve, reject) => {
    console.log(`\n========================================`);
    console.log(`RUNNING: ${cmd}`);
    console.log(`========================================`);
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      stream.on('close', (code, signal) => {
        if (code !== 0) {
          console.error(`Command exited with code ${code}`);
          return reject(new Error(`Exit code ${code}: ${stderr || stdout}`));
        }
        resolve(stdout);
      }).on('data', (data) => {
        process.stdout.write(data);
        stdout += data;
      }).stderr.on('data', (data) => {
        process.stderr.write(data);
        stderr += data;
      });
    });
  });
}

async function main() {
  const conn = new Client();
  await new Promise((resolve, reject) => {
    conn.on('ready', resolve).on('error', reject).connect({
      host: '148.113.8.82',
      port: 20033,
      username: 'root',
      password: 'xCqQSF4Xxq3In9kb',
      readyTimeout: 30000,
    });
  });

  console.log('Connected to new VPS!');

  // 1. Swap Setup (2GB swap for smooth builds)
  await runRemoteCommand(conn, `
    if [ $(free -m | awk '/^Swap:/ {print $2}') -lt 1000 ]; then
      echo "Configuring 2GB swap..."
      fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
      chmod 600 /swapfile
      mkswap /swapfile
      swapon /swapfile
      echo '/swapfile none swap sw 0 0' >> /etc/fstab
    fi
    free -m
  `);

  // 2. Base Packages
  await runRemoteCommand(conn, `
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y
    apt-get install -y curl ca-certificates gnupg git debian-keyring debian-archive-keyring apt-transport-https rsync ufw fail2ban build-essential postgresql postgresql-contrib redis-server
  `);

  // 3. Node.js 20 LTS
  await runRemoteCommand(conn, `
    if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1 | tr -d 'v')" -lt 20 ]]; then
      echo "Installing Node.js 20.x..."
      curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
      apt-get install -y nodejs
    fi
    node -v
    npm -v
  `);

  // 4. Caddy
  await runRemoteCommand(conn, `
    if ! command -v caddy >/dev/null 2>&1; then
      echo "Installing Caddy..."
      curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
      curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
      apt-get update -y
      apt-get install -y caddy
    fi
    caddy version
  `);

  // 5. Database & User Setup
  await runRemoteCommand(conn, `
    systemctl enable postgresql redis-server
    systemctl start postgresql redis-server

    sudo -u postgres psql -c "DO \\$\\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'blessing') THEN CREATE ROLE blessing WITH LOGIN PASSWORD 'blessing2025' SUPERUSER; END IF; END \\$\\$;"
    sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = 'blessing'" | grep -q 1 || sudo -u postgres psql -c "CREATE DATABASE blessing OWNER blessing;"
    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE blessing TO blessing;"
    sudo -u postgres psql -d blessing -c "GRANT ALL ON SCHEMA public TO blessing;"

    if ! id -u ubuntu >/dev/null 2>&1; then
      useradd -m -s /bin/bash ubuntu
      echo "ubuntu:xCqQSF4Xxq3In9kb" | chpasswd
      usermod -aG sudo ubuntu
      echo "ubuntu ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/90-ubuntu
    fi
    id ubuntu
  `);

  console.log('\n>>> PHASE 1 & 2 COMPLETE: Base packages, Node.js 20, PostgreSQL 16, Redis 7, Caddy, & user ubuntu are ready! <<<');
  conn.end();
}

main().catch(err => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
