const { spawn, execSync } = require('child_process');
const path = require('path');

const isWindows = process.platform === 'win32';

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

const args = process.argv.slice(2);
const helpRequested = args.includes('--help') || args.includes('-h');
const follow = args.includes('--follow') || args.includes('-f');
const tailLines = args.find(arg => arg.startsWith('--tail='));
const sinceTime = args.find(arg => arg.startsWith('--since='));
const servicesArg = args.find(arg => arg.startsWith('--services='));
const allServices = args.includes('--all') || args.includes('-a');

let customServices = null;
if (servicesArg) {
  customServices = servicesArg.split('=')[1].split(',').map(s => s.trim()).filter(Boolean);
}

if (helpRequested) {
  console.log(`
${colors.bright}${colors.cyan}==================================================${colors.reset}
${colors.bright}   📋 VIARA Live Logs${colors.reset}
${colors.bright}${colors.cyan}==================================================${colors.reset}

Usage: node logs.js [options]

Options:
  -f, --follow     Follow logs in real time (default)
  --tail=N         Show last N lines before following
  --since=TIME     Show logs since TIME (e.g. 10m, 1h, 2026-08-06T14:00:00)
  --services=a,b   Filter to specific services (backend, frontend, portal)
  --all, -a        Show logs for all Docker services (postgres, orthanc, ohif, etc.)
  --no-color       Disable colored output
  -h, --help       Show this help message

Examples:
  node logs.js                           Follow all VIARA app logs
  node logs.js --tail=100                Last 100 lines, then follow
  node logs.js --since=5m                Logs from the last 5 minutes
  node logs.js --services=backend        Only backend logs
  node logs.js --services=backend,portal Backend + portal logs
  node logs.js --all                     All Docker infra logs
`);
  process.exit(0);
}

const composeProject = process.env.COMPOSE_PROJECT_NAME || path.basename(path.join(__dirname, '..'));
const composeFile = path.join(__dirname, '..', 'docker-compose.yml');

function dockerCmd() {
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

function compose(...extraArgs) {
  const cmd = dockerCmd();
  if (!cmd) throw new Error('Docker Compose is not installed');
  const parts = [cmd, '-f', composeFile, '-p', composeProject, ...extraArgs];
  return parts.join(' ');
}

const serviceConfig = {
  backend: { prefix: '[backend]', color: colors.cyan },
  frontend: { prefix: '[frontend]', color: colors.green },
  portal: { prefix: '[portal]', color: colors.magenta }
};

function getTargetServices() {
  if (customServices) {
    return customServices;
  }
  if (allServices) {
    try {
      const output = execSync(compose('ps', '--format', 'json'), {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        shell: true
      });
      const all = JSON.parse(output.trim());
      return all.map(s => s.Service);
    } catch (err) {
      return ['backend', 'frontend', 'portal'];
    }
  }
  return ['backend', 'frontend', 'portal'];
}

function prefixOutput(data, serviceName) {
  const config = serviceConfig[serviceName];
  const prefix = config ? `${config.color}${config.prefix}${colors.reset}` : `${colors.gray}[${serviceName}]${colors.reset}`;
  const lines = data.toString().split('\r\n').join('\n').split('\n');
  lines.forEach(line => {
    if (line.trim().length > 0) {
      console.log(`${prefix} ${line}`);
    }
  });
}

function main() {
  const targetServices = getTargetServices();
  const useColor = !args.includes('--no-color');

  const header = `${colors.bright}${colors.cyan}==================================================${colors.reset}
${colors.bright}   📋 VIARA Live Logs${colors.reset}
${colors.bright}${colors.cyan}==================================================${colors.reset}
`;

  if (useColor) {
    console.log(header);
  } else {
    console.log('==================================================');
    console.log('   VIARA Live Logs');
    console.log('==================================================');
  }

  console.log(`  Following: ${targetServices.join(', ')}`);
  if (tailLines) {
    console.log(`  Tail: ${tailLines.split('=')[1]} lines`);
  }
  if (sinceTime) {
    console.log(`  Since: ${sinceTime.split('=')[1]}`);
  }
  console.log(`${colors.bright}${colors.cyan}==================================================${colors.reset}\n`);

  const cmd = compose('logs', ...(follow ? ['-f'] : []),
    ...(tailLines ? [`--tail=${tailLines.split('=')[1]}`] : []),
    ...(sinceTime ? [`--since=${sinceTime.split('=')[1]}`] : []),
    ...targetServices);

  try {
    const child = spawn(cmd, {
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, FORCE_COLOR: useColor ? 'true' : '0' }
    });

    child.on('close', code => {
      if (code !== 0 && code !== null) {
        console.error(`${colors.red}[logs] Process exited with code ${code}${colors.reset}`);
      }
    });

    child.on('error', err => {
      console.error(`${colors.red}[logs] Error: ${err.message}${colors.reset}`);
    });
  } catch (err) {
    console.error(`${colors.red}[logs] Failed to start log follow: ${err.message}${colors.reset}`);
    process.exit(1);
  }
}

main();