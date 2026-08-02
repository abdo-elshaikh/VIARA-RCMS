const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const isWindows = process.platform === 'win32';

// ANSI terminal color helpers
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  magenta: '\x1b[35m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  gray: '\x1b[90m'
};

// Parse command-line arguments
const args = process.argv.slice(2);
const helpRequested = args.includes('--help') || args.includes('-h');
const noDocker = args.includes('--no-docker') || process.env.NO_DOCKER === 'true';
const dockerAll = args.includes('--docker-all') || args.includes('--all');
const dockerOnly = args.includes('--docker-only');
const stopDockerOnExit = args.includes('--stop-docker') || args.includes('--down');

let customDockerServices = null;
const servicesArg = args.find(arg => arg.startsWith('--services='));
if (servicesArg) {
  customDockerServices = servicesArg.split('=')[1].split(',').map(s => s.trim()).filter(Boolean);
}

if (helpRequested) {
  console.log(`
${colors.bright}${colors.cyan}==================================================${colors.reset}
${colors.bright}   🚀 RCMS Service Launcher Options${colors.reset}
${colors.bright}${colors.cyan}==================================================${colors.reset}

Usage: node start-services.js [options]

Options:
  --docker         Start Docker infrastructure (postgres, orthanc, ohif) before local services (Default)
  --docker-all     Start all Docker containers defined in docker-compose.yml
  --docker-only    Start Docker containers only and attach to logs (no local Node processes)
  --no-docker      Skip Docker container startup and run Node services only
  --stop-docker    Stop Docker containers automatically when exiting
  --services=a,b   Specify custom Docker services to start (e.g. --services=postgres,orthanc)
  -h, --help       Show this help message

Environment Variables:
  NO_DOCKER=true            Disable automatic Docker startup
  DOCKER_INFRA_SERVICES     Override default infra services (default: "postgres orthanc ohif")
`);
  process.exit(0);
}

const services = [
  {
    name: 'backend',
    prefix: '[backend]',
    color: colors.cyan,
    dir: path.join(__dirname, 'backend'),
    command: isWindows ? 'npm.cmd' : 'npm',
    args: ['run', 'dev'],
    url: 'http://localhost:3000'
  },
  {
    name: 'frontend',
    prefix: '[frontend]',
    color: colors.green,
    dir: path.join(__dirname, 'frontend'),
    command: isWindows ? 'npm.cmd' : 'npm',
    args: ['run', 'dev'],
    url: 'http://localhost:5173'
  },
  {
    name: 'portal',
    prefix: '[portal]',
    color: colors.magenta,
    dir: path.join(__dirname, 'portal'),
    command: isWindows ? 'npm.cmd' : 'npm',
    args: ['run', 'dev'],
    url: 'http://localhost:5174'
  }
];

const children = [];
let activeDockerCmd = null;

function prefixOutput(data, service) {
  const lines = data.toString().split('\r\n').join('\n').split('\n');
  lines.forEach(line => {
    if (line.trim().length > 0) {
      console.log(`${service.color}${service.prefix}${colors.reset} ${line}`);
    }
  });
}

function detectDockerCompose() {
  try {
    execSync('docker compose version', { stdio: 'ignore' });
    return 'docker compose';
  } catch (e) {
    try {
      execSync('docker-compose version', { stdio: 'ignore' });
      return 'docker-compose';
    } catch (e2) {
      return null;
    }
  }
}

function isDockerDaemonRunning() {
  try {
    execSync('docker info', { stdio: 'ignore', shell: true });
    return true;
  } catch (e) {
    try {
      execSync('docker ps', { stdio: 'ignore', shell: true });
      return true;
    } catch (e2) {
      return false;
    }
  }
}

function isDockerDesktopProcessRunning() {
  if (!isWindows) return false;
  try {
    const out = execSync('tasklist /FI "IMAGENAME eq Docker Desktop.exe" /NH', { encoding: 'utf8', shell: true });
    return out.includes('Docker Desktop.exe');
  } catch (e) {
    return false;
  }
}

function attemptToStartDockerDaemon(maxWaitSec = 25) {
  if (isDockerDaemonRunning()) return true;

  console.log(`${colors.yellow}[docker] ⚠️ Docker daemon is not running.${colors.reset}`);

  let launchAttempted = false;

  if (isWindows) {
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const dockerDesktopPath = path.join(programFiles, 'Docker', 'Docker', 'Docker Desktop.exe');
    
    if (fs.existsSync(dockerDesktopPath)) {
      if (!isDockerDesktopProcessRunning()) {
        console.log(`${colors.cyan}[docker] 🚀 Launching Docker Desktop...${colors.reset}`);
        try {
          execSync(`powershell -Command "Start-Process '${dockerDesktopPath}'"`, { stdio: 'ignore' });
          launchAttempted = true;
        } catch (err) {
          try {
            execSync(`start "" "${dockerDesktopPath}"`, { shell: true, stdio: 'ignore' });
            launchAttempted = true;
          } catch (err2) {}
        }
      } else {
        console.log(`${colors.cyan}[docker] ⏳ Docker Desktop process is running, waiting for engine...${colors.reset}`);
        launchAttempted = true;
      }
    }
  } else if (process.platform === 'darwin') {
    if (fs.existsSync('/Applications/Docker.app')) {
      console.log(`${colors.cyan}[docker] 🚀 Launching Docker Desktop...${colors.reset}`);
      try {
        execSync('open -a Docker', { stdio: 'ignore' });
        launchAttempted = true;
      } catch (err) {}
    }
  } else if (process.platform === 'linux') {
    console.log(`${colors.cyan}[docker] 🚀 Starting Docker service...${colors.reset}`);
    try {
      execSync('sudo systemctl start docker', { stdio: 'ignore' });
      launchAttempted = true;
    } catch (err) {}
  }

  if (!launchAttempted) {
    console.log(`${colors.yellow}[docker] ⚠️ Docker Desktop executable not found. Starting Node services directly (use --no-docker to skip check).${colors.reset}\n`);
    return false;
  }

  process.stdout.write(`${colors.blue}[docker] Waiting for Docker engine to respond${colors.reset}`);
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitSec * 1000) {
    if (isDockerDaemonRunning()) {
      process.stdout.write('\n');
      console.log(`${colors.green}[docker] ✅ Docker engine ready!${colors.reset}\n`);
      return true;
    }
    process.stdout.write('.');
    sleepSync(1500);
  }
  process.stdout.write('\n');

  console.log(`${colors.yellow}[docker] ⚠️ Docker engine did not respond in time. Proceeding with local Node services...${colors.reset}\n`);
  return false;
}

function handleDockerStartup() {
  if (noDocker) {
    console.log(`${colors.gray}[docker] Automatic Docker startup is disabled (--no-docker).${colors.reset}\n`);
    return false;
  }

  let dockerCmd = detectDockerCompose();

  if (!isDockerDaemonRunning()) {
    const daemonReady = attemptToStartDockerDaemon();
    if (!daemonReady) {
      return false;
    }
    dockerCmd = dockerCmd || detectDockerCompose();
  }

  if (!dockerCmd) {
    console.log(`${colors.yellow}[docker] ⚠️ Docker / Docker Compose is not installed. Skipping Docker startup...${colors.reset}\n`);
    return false;
  }

  activeDockerCmd = dockerCmd;

  if (dockerOnly) {
    console.log(`${colors.bright}${colors.blue}[docker] Launching full Docker Compose stack...${colors.reset}`);
    try {
      execSync(`${dockerCmd} up --build`, { stdio: 'inherit' });
    } catch (err) {
      console.error(`${colors.red}[docker] Error running Docker Compose: ${err.message}${colors.reset}`);
    }
    process.exit(0);
  }

  const infraServices = customDockerServices || 
    (process.env.DOCKER_INFRA_SERVICES ? process.env.DOCKER_INFRA_SERVICES.split(' ') : ['postgres', 'orthanc', 'ohif']);

  const targetServicesStr = dockerAll ? '' : infraServices.join(' ');
  console.log(`${colors.bright}${colors.blue}[docker] 🐳 Starting Docker infrastructure services (${dockerAll ? 'all containers' : targetServicesStr})...${colors.reset}`);

  try {
    execSync(`${dockerCmd} up -d ${targetServicesStr}`, { stdio: 'inherit' });
    console.log(`${colors.green}[docker] ✅ Docker infrastructure services started successfully.${colors.reset}\n`);
    
    if (!dockerAll && infraServices.includes('postgres')) {
      waitForPostgres(dockerCmd);
    }
    return true;
  } catch (err) {
    console.error(`${colors.red}[docker] ❌ Failed to start Docker services: ${err.message}${colors.reset}\n`);
    return false;
  }
}

function sleepSync(ms) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch (e) {
    const start = Date.now();
    while (Date.now() - start < ms) {}
  }
}

function waitForPostgres(dockerCmd, maxWaitSec = 10) {
  console.log(`${colors.blue}[docker] Checking PostgreSQL database readiness...${colors.reset}`);
  const startTime = Date.now();
  const user = process.env.POSTGRES_USER || 'rcms';
  const db = process.env.POSTGRES_DB || 'rcms';

  while (Date.now() - startTime < maxWaitSec * 1000) {
    try {
      execSync(`${dockerCmd} exec -T postgres pg_isready -U ${user} -d ${db}`, { stdio: 'ignore' });
      console.log(`${colors.green}[docker] PostgreSQL is ready to accept connections.${colors.reset}\n`);
      return true;
    } catch (e) {
      sleepSync(1000);
    }
  }
  console.log(`${colors.yellow}[docker] PostgreSQL readiness check timed out. Proceeding...${colors.reset}\n`);
  return false;
}

function main() {
  console.log(`${colors.bright}${colors.cyan}==================================================${colors.reset}`);
  console.log(`${colors.bright}   🚀 Launching RCMS Services (Backend, Frontend, Portal)${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}==================================================${colors.reset}`);
  
  // Handle Docker initialization
  const dockerStarted = handleDockerStartup();

  if (dockerStarted) {
    console.log(`  * ${colors.blue}${'docker'.padEnd(12)}${colors.reset} -> ${colors.yellow}postgres (5432), orthanc (8042), ohif (3005)${colors.reset}`);
  }
  services.forEach(s => {
    console.log(`  * ${s.color}${s.name.padEnd(12)}${colors.reset} -> ${colors.yellow}${s.url}${colors.reset}`);
  });
  console.log(`${colors.bright}${colors.cyan}==================================================${colors.reset}\n`);

  services.forEach(service => {
    console.log(`${service.color}${service.prefix}${colors.reset} Starting service in ${service.dir}...`);

    const child = spawn(service.command, service.args, {
      cwd: service.dir,
      shell: true,
      env: { ...process.env, FORCE_COLOR: 'true' }
    });

    children.push({ child, service });

    child.stdout.on('data', data => prefixOutput(data, service));
    child.stderr.on('data', data => prefixOutput(data, service));

    child.on('close', code => {
      console.log(`${service.color}${service.prefix}${colors.reset} Process exited with code ${code}`);
    });

    child.on('error', err => {
      console.error(`${colors.red}${service.prefix} Error starting process: ${err.message}${colors.reset}`);
    });
  });
}

let stopping = false;
function stopAllServices() {
  if (stopping) return;
  stopping = true;
  console.log(`\n${colors.yellow}Shutting down all services...${colors.reset}`);

  children.forEach(({ child, service }) => {
    if (child && child.pid) {
      try {
        if (isWindows) {
          execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
        } else {
          child.kill('SIGTERM');
        }
        console.log(`${service.color}${service.prefix}${colors.reset} Stopped successfully.`);
      } catch (err) {
        // Ignored if process already terminated
      }
    }
  });

  if (stopDockerOnExit && activeDockerCmd) {
    console.log(`${colors.blue}[docker] Stopping Docker containers...${colors.reset}`);
    try {
      execSync(`${activeDockerCmd} stop`, { stdio: 'inherit' });
      console.log(`${colors.green}[docker] Docker containers stopped.${colors.reset}`);
    } catch (err) {
      console.error(`${colors.red}[docker] Error stopping Docker containers: ${err.message}${colors.reset}`);
    }
  }

  process.exit(0);
}

process.on('SIGINT', stopAllServices);
process.on('SIGTERM', stopAllServices);

main();

