CREATE TABLE IF NOT EXISTS tasks (
 id TEXT PRIMARY KEY,
 payload TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1,
 deleted INTEGER NOT NULL DEFAULT 0,
 updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS history (
 event_id INTEGER PRIMARY KEY AUTOINCREMENT,
 task_id TEXT NOT NULL,
 operation TEXT NOT NULL,
 payload TEXT,
 revision INTEGER NOT NULL,
 changed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS board_state (
 id INTEGER PRIMARY KEY CHECK (id = 1),
 version INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO board_state (id, version) VALUES (1, 0);
CREATE TRIGGER IF NOT EXISTS task_insert AFTER INSERT ON tasks BEGIN
 INSERT INTO history(task_id,operation,payload,revision,changed_at) VALUES(NEW.id,'create',NEW.payload,NEW.revision,NEW.updated_at);
 UPDATE board_state SET version=version+1 WHERE id=1;
END;
CREATE TRIGGER IF NOT EXISTS task_update AFTER UPDATE ON tasks BEGIN
 INSERT INTO history(task_id,operation,payload,revision,changed_at) VALUES(NEW.id,CASE WHEN NEW.deleted=1 THEN 'delete' ELSE 'update' END,NEW.payload,NEW.revision,NEW.updated_at);
 UPDATE board_state SET version=version+1 WHERE id=1;
END;
