/**
 * GitHub Status API Client
 * Type-safe client for fetching data from GitHub Status API
 */

export interface GitHubStatusComponent {
  id: string;
  name: string;
  status: 'operational' | 'degraded_performance' | 'partial_outage' | 'major_outage' | 'under_maintenance';
  created_at: string;
  updated_at: string;
  position: number;
  description: string | null;
  showcase?: boolean;
  start_date?: string | null;
  group_id: string | null;
  page_id?: string;
  group?: boolean;
  only_show_if_degraded?: boolean;
}

export interface GitHubStatusIncident {
  id: string;
  name: string;
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved' | 'postmortem';
  impact: 'none' | 'minor' | 'major' | 'critical' | 'maintenance';
  created_at: string;
  updated_at: string;
  monitoring_at?: string | null;
  resolved_at: string | null;
  impact_override?: string | null;
  shortlink: string;
  started_at: string;
  page_id: string;
  incident_updates: IncidentUpdate[];
  components: ComponentStatus[];
  postmortem_body?: string | null;
  postmortem_body_last_updated_at?: string | null;
}

export interface IncidentUpdate {
  id: string;
  status: string;
  body: string;
  created_at: string;
  updated_at: string;
  display_at: string;
  affected_components: {
    code: string;
    name: string;
    old_status: string;
    new_status: string;
  }[] | null;
}

export interface ComponentStatus {
  code: string;
  name: string;
  old_status?: string;
  new_status?: string;
}

export interface GitHubStatusSummary {
  page: {
    id: string;
    name: string;
    url: string;
    time_zone: string;
    updated_at: string;
  };
  status: {
    indicator: 'none' | 'minor' | 'major' | 'critical' | 'maintenance';
    description: string;
  };
  components: GitHubStatusComponent[];
  incidents: GitHubStatusIncident[];
  scheduled_maintenances: any[];
}

const API_BASE = 'https://www.githubstatus.com/api/v2';

/**
 * Fetch data from GitHub Status API
 */
async function fetchGitHubStatus<T>(endpoint: string): Promise<T> {
  const url = `${API_BASE}/${endpoint}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Error fetching ${endpoint}:`, error);
    throw error;
  }
}

/**
 * Get summary of current status
 */
export async function getSummary(): Promise<GitHubStatusSummary> {
  return fetchGitHubStatus<GitHubStatusSummary>('summary.json');
}

/**
 * Get all components
 */
export async function getComponents(): Promise<{ components: GitHubStatusComponent[] }> {
  return fetchGitHubStatus<{ components: GitHubStatusComponent[] }>('components.json');
}

/**
 * Get all incidents (50 most recent)
 */
export async function getIncidents(): Promise<{ incidents: GitHubStatusIncident[] }> {
  return fetchGitHubStatus<{ incidents: GitHubStatusIncident[] }>('incidents.json');
}

/**
 * Get unresolved incidents only
 */
export async function getUnresolvedIncidents(): Promise<{ incidents: GitHubStatusIncident[] }> {
  return fetchGitHubStatus<{ incidents: GitHubStatusIncident[] }>('incidents/unresolved.json');
}

/**
 * Get current status indicator
 */
export async function getStatus(): Promise<{
  status: {
    indicator: 'none' | 'minor' | 'major' | 'critical' | 'maintenance';
    description: string;
  };
}> {
  return fetchGitHubStatus('status.json');
}

/**
 * Get component name by code
 */
export function getComponentName(components: GitHubStatusComponent[], code: string): string {
  const component = components.find(c => c.id === code);
  return component ? component.name : code;
}

/**
 * Get component status label
 */
export function getComponentStatusLabel(status: GitHubStatusComponent['status']): string {
  const labels: Record<GitHubStatusComponent['status'], string> = {
    'operational': 'Operational',
    'degraded_performance': 'Degraded Performance',
    'partial_outage': 'Partial Outage',
    'major_outage': 'Major Outage',
    'under_maintenance': 'Under Maintenance',
  };

  return labels[status] || status;
}

/**
 * Get impact label
 */
export function getImpactLabel(impact: GitHubStatusIncident['impact']): string {
  const labels: Record<GitHubStatusIncident['impact'], string> = {
    'none': 'None',
    'minor': 'Minor',
    'major': 'Major',
    'critical': 'Critical',
    'maintenance': 'Maintenance',
  };

  return labels[impact] || impact;
}

/**
 * Get status label
 */
export function getStatusLabel(status: GitHubStatusIncident['status']): string {
  const labels: Record<GitHubStatusIncident['status'], string> = {
    'investigating': 'Investigating',
    'identified': 'Identified',
    'monitoring': 'Monitoring',
    'resolved': 'Resolved',
    'postmortem': 'Postmortem',
  };

  return labels[status] || status;
}
