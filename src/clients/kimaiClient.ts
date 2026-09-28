export interface KimaiClientConfig {
  baseUrl: string;
  token: string;
}
export interface KimaiProject {
  id: number;
  name: string;
}
export interface KimaiActivity {
  id: number;
  name: string;
}
export interface KimaiTimesheet {
  id: number;
  begin: string;
  end: string;
  project: number;
  activity: number;
}

function headers(config: KimaiClientConfig): HeadersInit {
  return {
    Authorization: `Bearer ${config.token}`,
    "Content-Type": "application/json",
  };
}

export async function testKimaiConnection(config: KimaiClientConfig): Promise<boolean> {
  try {
    const res = await fetch(`${config.baseUrl}/api/projects`, { headers: headers(config) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchKimaiProjects(config: KimaiClientConfig): Promise<KimaiProject[]> {
  const res = await fetch(`${config.baseUrl}/api/projects`, { headers: headers(config) });
  if (!res.ok) throw new Error(`Kimai projects request failed: ${res.status}`);
  return res.json();
}

export async function fetchKimaiActivities(config: KimaiClientConfig): Promise<KimaiActivity[]> {
  const res = await fetch(`${config.baseUrl}/api/activities`, { headers: headers(config) });
  if (!res.ok) throw new Error(`Kimai activities request failed: ${res.status}`);
  return res.json();
}

export async function fetchKimaiTimesheets(
  config: KimaiClientConfig,
  begin: Date,
  end: Date
): Promise<KimaiTimesheet[]> {
  const url = `${config.baseUrl}/api/timesheets?begin=${begin.toISOString()}&end=${end.toISOString()}&size=1000`;
  const res = await fetch(url, { headers: headers(config) });
  if (!res.ok) throw new Error(`Kimai timesheets request failed: ${res.status}`);
  return res.json();
}

export async function createKimaiTimesheet(
  config: KimaiClientConfig,
  entry: { begin: string; end: string; project: number; activity: number; description: string }
): Promise<KimaiTimesheet> {
  const res = await fetch(`${config.baseUrl}/api/timesheets`, {
    method: "POST",
    headers: headers(config),
    body: JSON.stringify(entry),
  });
  if (!res.ok) throw new Error(`Kimai timesheet creation failed: ${res.status} ${await res.text()}`);
  return res.json();
}
