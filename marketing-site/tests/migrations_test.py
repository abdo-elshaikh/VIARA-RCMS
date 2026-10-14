import sqlite3
import unittest
from pathlib import Path

class MigrationTests(unittest.TestCase):
    def test_existing_requests_survive_schema_upgrade(self):
        db=sqlite3.connect(':memory:')
        paths=sorted(Path('drizzle').glob('*.sql'))
        db.executescript(paths[0].read_text())
        db.execute("INSERT INTO inquiries (id,user_id,name,email,phone,organization,facility,branches,interest,plan,message,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",('legacy','owner','Example','sample@example.com','12345678','Example center','مركز أشعة','فرع واحد','RIS','أساس','',1))
        for path in paths[1:]: db.executescript(path.read_text())
        self.assertEqual(db.execute("SELECT user_id,locale,offer FROM inquiries WHERE id='legacy'").fetchone(),('owner','ar',''))
        tables={r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertTrue({'site_settings','reviews','inquiries'}<=tables)
        db.close()
    def test_content_revisions_cannot_be_overwritten_by_stale_editor(self):
        db=sqlite3.connect(':memory:')
        for path in sorted(Path('drizzle').glob('*.sql')): db.executescript(path.read_text())
        db.execute("INSERT INTO site_settings VALUES ('main','{}',1,'owner',1)")
        first=db.execute("UPDATE site_settings SET version=2,value='new' WHERE key='main' AND version=1").rowcount
        stale=db.execute("UPDATE site_settings SET version=2,value='stale' WHERE key='main' AND version=1").rowcount
        self.assertEqual((first,stale),(1,0))
        self.assertEqual(db.execute("SELECT value FROM site_settings").fetchone()[0],'new')
        db.close()
if __name__=='__main__': unittest.main()
