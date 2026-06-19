import type { Page } from 'playwright';

export type Modality = 'vision' | 'text';
export type ActionType = 'click' | 'type' | 'hover' | 'clear';
export type ScrollDirection = 'up' | 'down' | 'left' | 'right';
export type EvalJSXSSMode = 'warn' | 'block' | 'off';

export interface BrowseAgenticConfig {
  server: {
    transport: 'stdio';
  };
  browser: {
    engine: 'chromium';
    headless: boolean;
    viewport: { width: number; height: number };
    args: string[];
    timeout_ms: number;
    chrome_path?: string;
    cdp_port?: number;
    user_data_dir?: string;
  };
  security: {
    block_localhost: boolean;
    blocked_domains: string[];
    allowed_domains: string[];
    secret_redaction_patterns: string[];
    eval_js_xss_detection: EvalJSXSSMode;
    console_capture_level: 'error' | 'warning' | 'info' | 'debug';
  };
  artifacts: {
    record_video: boolean;
    video_dir: string;
    capture_console_errors: boolean;
    capture_network_failures: boolean;
  };
  fallback_vision: {
    enabled: boolean;
  };
  budget: {
    max_elements: number;
    per_field_char_cap: number;
    total_response_char_cap: number;
    overflow_dir: string;
  };
  cache: {
    enabled: boolean;
    backend: 'memory' | 'filesystem';
    dir: string;
    ttl_hours: number;
  };
  rsi: {
    sandbox_root: string;
    protected_patterns: string[];
    hidden_patterns: string[];
    command_allowlist: string[];
    command_timeout_ms: number;
    max_stdout_chars: number;
  };
  tabs: {
    max_open_tabs: number;
  };
  session: {
    profiles_dir: string;
  };
}

export interface AOMNode {
  agent_id: number;
  ref: string;
  role: string;
  name: string;
  value?: string;
  description?: string;
  placeholder?: string;
  state: {
    disabled: boolean;
    focused: boolean;
    checked?: boolean;
    expanded?: boolean;
  };
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  is_fallback_translated: boolean;
}

export interface ObservationPayload {
  url: string;
  title: string;
  modality: Modality;
  viewport: { width: number; height: number };
  console_alerts: string[];
  network_alerts: string[];
  image_base64?: string;
  image_width?: number;
  image_height?: number;
  aom_nodes?: AOMNode[];
  aom_markdown?: string;
}

export interface SessionState {
  session_id: string;
  created_at: number;
  tabs: Map<number, Page>;
  active_tab_id: number;
  console_log_buffer: Map<number, string[]>;
  network_failure_buffer: Map<number, string[]>;
  last_aom_hash: string | null;
  element_map: Map<string, { selector?: string; rect: AOMNode['rect']; full_url?: string }>;
  last_modality: Modality | null;
}

export interface CacheEntry {
  key: string;
  instruction: string;
  url_origin_path: string;
  variable_keys: string[];
  selector_strategy: { type: 'role_name' | 'css'; role?: string; name?: string; nth?: number; css?: string };
  created_at: number;
  last_used_at: number;
}

export interface TabInfo {
  tab_id: number;
  url: string;
  title: string;
  is_active: boolean;
}

export interface RSIFileResult {
  success: boolean;
  content?: string;
  truncated?: boolean;
  size_bytes?: number;
  error?: string;
}

export interface RSICommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exit_code: number;
  timed_out: boolean;
  error?: string;
}

export interface SessionProfile {
  name: string;
  saved_at: string;
  size_bytes: number;
}

export interface BudgetConfig {
  max_elements: number;
  per_field_char_cap: number;
  total_response_char_cap: number;
  overflow_dir: string;
}
