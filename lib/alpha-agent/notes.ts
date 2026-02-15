/**
 * Alpha Agent - Notes System
 * 
 * Persistent context notes that the agent manages intelligently.
 * Unlike memories (which are observations/patterns/lessons), notes are
 * active working documents the agent curates:
 * 
 * - Strategy playbook entries
 * - Current focus areas
 * - Admin directives and protocols
 * - Running analysis summaries
 * - Watch lists (traders, markets, patterns)
 * 
 * Notes are included in the agent's context window for every run and
 * chat, so the agent should keep them concise and up-to-date.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface AgentNote {
  note_id: string;
  title: string;
  content: string;
  category: string;
  priority: number;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Get all notes, ordered by priority (pinned first, then by priority desc)
 */
export async function getNotes(
  supabase: SupabaseClient,
  options?: { category?: string; limit?: number }
): Promise<AgentNote[]> {
  let query = supabase
    .from('alpha_agent_notes')
    .select('*')
    .order('pinned', { ascending: false })
    .order('priority', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(options?.limit || 30);

  if (options?.category) {
    query = query.eq('category', options.category);
  }

  const { data, error } = await query;
  if (error) {
    console.warn('[Notes] Failed to fetch notes:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Build a compact notes context string for the LLM
 */
export async function buildNotesContext(
  supabase: SupabaseClient,
  maxNotes: number = 15
): Promise<string> {
  const notes = await getNotes(supabase, { limit: maxNotes });
  if (notes.length === 0) return '';

  const sections = notes.map(n => {
    const pin = n.pinned ? ' [PINNED]' : '';
    const cat = n.category !== 'general' ? ` (${n.category})` : '';
    return `### ${n.title}${pin}${cat}\nnote_id: ${n.note_id}\n${n.content}`;
  });

  return `## YOUR NOTES (actively managed context - you can edit/delete these)\n${sections.join('\n\n')}`;
}
