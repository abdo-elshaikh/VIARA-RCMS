#!/usr/bin/env python3
"""Provision only the first account, over local Docker stdin, without defaults."""
import argparse
import getpass
import json
import re
import subprocess
from pathlib import Path

QUERY = "const {Pool}=require('pg'); const p=new Pool({connectionString:process.env.DATABASE_URL}); p.query('SELECT EXISTS(SELECT 1 FROM users) AS initialized').then(r=>console.log(JSON.stringify(r.rows[0]))).catch(()=>{console.error('Account initialization check failed');process.exitCode=1}).finally(()=>p.end());"
CREATE = r"""
const {Pool}=require('pg');const bcrypt=require('bcrypt');let input='';
process.stdin.on('data',chunk=>{input+=chunk;if(input.length>4096)process.exit(1)});
process.stdin.on('end',async()=>{
 const p=new Pool({connectionString:process.env.DATABASE_URL});let c;
 try{
  const v=JSON.parse(input);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)||v.email.length>150||typeof v.name!=='string'||!v.name.trim()||v.name.length>100||typeof v.password!=='string'||v.password.length<16||Buffer.byteLength(v.password)>72)throw Error();
  const hash=await bcrypt.hash(v.password,12);c=await p.connect();await c.query('BEGIN');
  await c.query("SELECT pg_advisory_xact_lock(hashtext('viara-initial-admin'))");
  const existing=await c.query('SELECT 1 FROM users LIMIT 1');
  if(existing.rows.length){await c.query('ROLLBACK');console.log(JSON.stringify({created:false}));return;}
  await c.query("INSERT INTO users(full_name,email,password_hash,role,is_active,must_change_password) VALUES($1,$2,$3,'Admin',true,true)",[v.name.trim(),v.email.toLowerCase(),hash]);
  await c.query("INSERT INTO role_permissions(role_name,permission_id) SELECT 'Admin'::user_role,permission_id FROM permissions ON CONFLICT DO NOTHING");
  await c.query('COMMIT');console.log(JSON.stringify({created:true}));
 }catch(e){if(c)await c.query('ROLLBACK').catch(()=>{});console.error('Initial administrator provisioning failed');process.exitCode=1;}
 finally{if(c)c.release();await p.end();}
});
"""

def run(compose, script, data=None):
    result = subprocess.run(compose + ['exec', '-T', 'backend', 'node', '-e', script],
                            input=json.dumps(data) if data else '', text=True, capture_output=True, timeout=90)
    if result.returncode:
        raise ValueError('Administrator setup failed. Check service readiness locally.')
    return json.loads(result.stdout)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--settings-file', type=Path)
    parser.add_argument('--env-file', type=Path)
    args = parser.parse_args()
    compose = ['docker', 'compose'] + (['--env-file', str(args.env_file)] if args.env_file else [])
    if run(compose, QUERY)['initialized']:
        print('Existing accounts preserved. No passwords or roles changed.')
        return
    if args.settings_file:
        site = json.loads(args.settings_file.read_text(encoding='utf-8-sig'))
        data = dict(email=site['admin_email'], name=site['admin_name'], password=site['admin_password'])
    else:
        data = dict(email=input('Initial administrator email: ').strip(), name=input('Administrator name: ').strip(), password=getpass.getpass('Initial password (16+ characters, hidden): '))
        if data['password'] != getpass.getpass('Confirm password (hidden): '):
            raise ValueError('Passwords do not match.')
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', data['email']) or len(data['email']) > 150:
        raise ValueError('Invalid administrator email.')
    if not data['name'].strip() or len(data['name']) > 100:
        raise ValueError('Administrator name must contain 1 to 100 characters.')
    if len(data['password']) < 16 or len(data['password'].encode('utf-8')) > 72:
        raise ValueError('Use a password with at least 16 characters and at most 72 UTF-8 bytes.')
    result = run(compose, CREATE, data)
    print('Initial Admin created. Change the password at first sign-in.' if result['created'] else 'Existing accounts preserved.')

if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError, subprocess.TimeoutExpired):
        print('Administrator setup incomplete. Retry setup; existing accounts remain unchanged.')
        raise SystemExit(1)
