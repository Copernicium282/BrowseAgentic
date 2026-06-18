export type Modality = 'vision' | 'text';

export type ActionType = 'click' | 'type' | 'hover' | 'clear';

export type ScrollDirection = 'up' | 'down' | 'left' | 'right';

export interface OmniBrowserConfig {
  server: {
    transport: 'stdio';
  };
  browser: {
    engine: 'chromium';
    headless: boolean;
    viewport: { width: number; height: number };
    args: string[];
    timeout_ms: number;
  };
  security: {
    block_localhost: boolean;
    blocked_domains: string[];
    allowed_domains: string[];
    allowed_paths: string[];
    blocked_paths: string[];
    allowed_commands: string[];
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
  console_log_buffer: string[];
  network_failure_buffer: string[];
  last_aom_hash: string | null;
  element_map: Map<string, { selector?: string; rect: AOMNode['rect'] }>;
  last_modality: Modality | null;
}
