/** Cursor hook payload — only fields we read. Unknown extras are ignored. */
export type CursorPayload = {
  hook_event_name?: string;
  conversation_id?: string;
  session_id?: string;
  model?: string;
  model_id?: string;
  transcript_path?: string;
  composer_mode?: string;
  reason?: string;
  duration_ms?: number;
  final_status?: string;
  error_message?: string;
  subagent_id?: string;
  subagent_type?: string;
  task?: string;
  parent_conversation_id?: string;
  subagent_model?: string;
  is_parallel_worker?: boolean;
  status?: string;
  description?: string;
  summary?: string;
  message_count?: number;
  tool_call_count?: number;
  modified_files?: string[];
  cwd?: string;
  workspace_roots?: string[];
  prompt?: string;
};

export type IngestedSubagent = {
  type?: string;
  id?: string;
  task?: string;
  parallel?: boolean;
  description?: string;
  summary?: string;
};

export type IngestedMetrics = {
  duration_ms?: number;
  status?: string;
  tool_call_count?: number;
  message_count?: number;
  reason?: string;
  final_status?: string;
  error_message?: string;
};

/** One JSONL line written by ingest. */
export type IngestedEvent = {
  ts: string;
  event: string;
  root: string;
  session?: string;
  parent?: string;
  model?: string;
  composer_mode?: string;
  prompt?: string;
  subagent?: IngestedSubagent;
  metrics?: IngestedMetrics;
  modified?: string[];
};

export type Span = {
  type: string;
  id: string;
  task: string;
  started: string;
  ended?: string;
  session?: string;
  parallel?: boolean;
  children: Span[];
  duration_ms?: number;
  status?: string;
  summary?: string;
  modified?: string[];
};

export type RootHeader = {
  session: string;
  model?: string;
  composer_mode?: string;
  started?: string;
  ended?: string;
  duration_ms?: number;
  reason?: string;
  prompt?: string;
};
