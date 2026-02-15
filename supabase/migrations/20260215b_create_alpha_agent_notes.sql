-- Alpha Agent Notes: persistent context notes the agent manages
CREATE TABLE IF NOT EXISTS alpha_agent_notes (
    note_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general' CHECK (category IN (
        'protocol', 'playbook', 'watchlist', 'analysis', 'directive', 'general'
    )),
    priority INTEGER NOT NULL DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
    pinned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_notes_priority ON alpha_agent_notes(pinned DESC, priority DESC);
CREATE INDEX IF NOT EXISTS idx_agent_notes_category ON alpha_agent_notes(category);
