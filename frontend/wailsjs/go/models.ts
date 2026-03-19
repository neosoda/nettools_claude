export namespace audit {

	export class AuditReport {
	    device_id: string;
	    device_ip: string;
	    device_hostname: string;
	    total_rules: number;
	    passed: number;
	    failed: number;
	    score: number;
	    results: models.AuditResult[];
	    remediation: string;
	    // Go type: time
	    created_at: any;

	    static createFrom(source: any = {}) {
	        return new AuditReport(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.device_id = source["device_id"];
	        this.device_ip = source["device_ip"];
	        this.device_hostname = source["device_hostname"];
	        this.total_rules = source["total_rules"];
	        this.passed = source["passed"];
	        this.failed = source["failed"];
	        this.score = source["score"];
	        this.results = this.convertValues(source["results"], models.AuditResult);
	        this.remediation = source["remediation"];
	        this.created_at = this.convertValues(source["created_at"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace diff {
	
	export class DiffLine {
	    type: string;
	    content: string;
	    line_a: number;
	    line_b: number;
	
	    static createFrom(source: any = {}) {
	        return new DiffLine(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.content = source["content"];
	        this.line_a = source["line_a"];
	        this.line_b = source["line_b"];
	    }
	}
	export class DiffResult {
	    diffs: DiffLine[];
	    added: number;
	    removed: number;
	    unchanged: number;
	    summary: string;

	    static createFrom(source: any = {}) {
	        return new DiffResult(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.diffs = this.convertValues(source["diffs"], DiffLine);
	        this.added = source["added"];
	        this.removed = source["removed"];
	        this.unchanged = source["unchanged"];
	        this.summary = source["summary"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace main {
	
	export class AppSettings {
	    theme: string;
	    language: string;
	    backup_dir: string;
	    max_workers: number;
	    log_retention_days: number;
	
	    static createFrom(source: any = {}) {
	        return new AppSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.theme = source["theme"];
	        this.language = source["language"];
	        this.backup_dir = source["backup_dir"];
	        this.max_workers = source["max_workers"];
	        this.log_retention_days = source["log_retention_days"];
	    }
	}
	export class AuditLogQuery {
	    limit: number;
	    offset: number;
	    action: string;
	
	    static createFrom(source: any = {}) {
	        return new AuditLogQuery(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.limit = source["limit"];
	        this.offset = source["offset"];
	        this.action = source["action"];
	    }
	}
	export class BackupRequest {
	    device_ids: string[];
	    config_type: string;
	    credential_id: string;
	    username: string;
	    password: string;
	    ip_list: string[];
	
	    static createFrom(source: any = {}) {
	        return new BackupRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.device_ids = source["device_ids"];
	        this.config_type = source["config_type"];
	        this.credential_id = source["credential_id"];
	        this.username = source["username"];
	        this.password = source["password"];
	        this.ip_list = source["ip_list"];
	    }
	}
	export class CredentialInput {
	    id: string;
	    name: string;
	    username: string;
	    password: string;
	    private_key: string;
	    snmp_community: string;
	    snmp_auth_key: string;
	    snmp_priv_key: string;
	    snmp_version: string;
	    snmp_auth_protocol: string;
	    snmp_priv_protocol: string;
	    snmp_username: string;
	
	    static createFrom(source: any = {}) {
	        return new CredentialInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.username = source["username"];
	        this.password = source["password"];
	        this.private_key = source["private_key"];
	        this.snmp_community = source["snmp_community"];
	        this.snmp_auth_key = source["snmp_auth_key"];
	        this.snmp_priv_key = source["snmp_priv_key"];
	        this.snmp_version = source["snmp_version"];
	        this.snmp_auth_protocol = source["snmp_auth_protocol"];
	        this.snmp_priv_protocol = source["snmp_priv_protocol"];
	        this.snmp_username = source["snmp_username"];
	    }
	}
	export class DiffRequest {
	    text_a: string;
	    text_b: string;
	    ignore_patterns: string[];
	    ignore_case: boolean;
	    ignore_whitespace: boolean;
	    trim_trailing: boolean;

	    static createFrom(source: any = {}) {
	        return new DiffRequest(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.text_a = source["text_a"];
	        this.text_b = source["text_b"];
	        this.ignore_patterns = source["ignore_patterns"];
	        this.ignore_case = source["ignore_case"];
	        this.ignore_whitespace = source["ignore_whitespace"];
	        this.trim_trailing = source["trim_trailing"];
	    }
	}
	export class PlaybookRunRequest {
	    playbook_id: string;
	    device_ids: string[];
	
	    static createFrom(source: any = {}) {
	        return new PlaybookRunRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.playbook_id = source["playbook_id"];
	        this.device_ids = source["device_ids"];
	    }
	}
	export class SNMPTestResult {
	    ip: string;
	    reachable: boolean;
	    data: Record<string, string>;
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new SNMPTestResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ip = source["ip"];
	        this.reachable = source["reachable"];
	        this.data = source["data"];
	        this.error = source["error"];
	    }
	}
	export class SSHCommandRequest {
	    device_ids: string[];
	    commands: string[];
	
	    static createFrom(source: any = {}) {
	        return new SSHCommandRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.device_ids = source["device_ids"];
	        this.commands = source["commands"];
	    }
	}
	export class ScanRequest {
	    cidr: string;
	    ip_list: string[];
	    community: string;
	    credential_id: string;
	    workers: number;
	    timeout_sec: number;
	
	    static createFrom(source: any = {}) {
	        return new ScanRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cidr = source["cidr"];
	        this.ip_list = source["ip_list"];
	        this.community = source["community"];
	        this.credential_id = source["credential_id"];
	        this.workers = source["workers"];
	        this.timeout_sec = source["timeout_sec"];
	    }
	}

}

export namespace models {
	
	export class AuditLog {
	    id: string;
	    action: string;
	    entity_type: string;
	    entity_id: string;
	    details: string;
	    status: string;
	    duration_ms: number;
	    // Go type: time
	    created_at: any;
	
	    static createFrom(source: any = {}) {
	        return new AuditLog(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.action = source["action"];
	        this.entity_type = source["entity_type"];
	        this.entity_id = source["entity_id"];
	        this.details = source["details"];
	        this.status = source["status"];
	        this.duration_ms = source["duration_ms"];
	        this.created_at = this.convertValues(source["created_at"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AuditResult {
	    id: string;
	    device_id: string;
	    rule_id: string;
	    rule_name: string;
	    passed: boolean;
	    details: string;
	    severity: string;
	    remediation: string;
	    // Go type: time
	    created_at: any;

	    static createFrom(source: any = {}) {
	        return new AuditResult(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.device_id = source["device_id"];
	        this.rule_id = source["rule_id"];
	        this.rule_name = source["rule_name"];
	        this.passed = source["passed"];
	        this.details = source["details"];
	        this.severity = source["severity"];
	        this.remediation = source["remediation"];
	        this.created_at = this.convertValues(source["created_at"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AuditRule {
	    id: string;
	    name: string;
	    description: string;
	    pattern: string;
	    must_match: boolean;
	    vendor: string;
	    severity: string;
	    remediation: string;
	    enabled: boolean;
	    // Go type: time
	    created_at: any;

	    static createFrom(source: any = {}) {
	        return new AuditRule(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.description = source["description"];
	        this.pattern = source["pattern"];
	        this.must_match = source["must_match"];
	        this.vendor = source["vendor"];
	        this.severity = source["severity"];
	        this.remediation = source["remediation"];
	        this.enabled = source["enabled"];
	        this.created_at = this.convertValues(source["created_at"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Backup {
	    id: string;
	    device_id: string;
	    config_type: string;
	    file_path: string;
	    file_size_bytes: number;
	    sha256_hash: string;
	    status: string;
	    duration_ms: number;
	    error_message: string;
	    content?: string;
	    // Go type: time
	    created_at: any;
	
	    static createFrom(source: any = {}) {
	        return new Backup(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.device_id = source["device_id"];
	        this.config_type = source["config_type"];
	        this.file_path = source["file_path"];
	        this.file_size_bytes = source["file_size_bytes"];
	        this.sha256_hash = source["sha256_hash"];
	        this.status = source["status"];
	        this.duration_ms = source["duration_ms"];
	        this.error_message = source["error_message"];
	        this.content = source["content"];
	        this.created_at = this.convertValues(source["created_at"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class CredentialView {
	    id: string;
	    name: string;
	    username: string;
	    has_password: boolean;
	    has_private_key: boolean;
	    has_snmp_community: boolean;
	    snmp_version: string;
	    snmp_auth_protocol: string;
	    snmp_priv_protocol: string;
	    snmp_username: string;
	    // Go type: time
	    created_at: any;
	
	    static createFrom(source: any = {}) {
	        return new CredentialView(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.username = source["username"];
	        this.has_password = source["has_password"];
	        this.has_private_key = source["has_private_key"];
	        this.has_snmp_community = source["has_snmp_community"];
	        this.snmp_version = source["snmp_version"];
	        this.snmp_auth_protocol = source["snmp_auth_protocol"];
	        this.snmp_priv_protocol = source["snmp_priv_protocol"];
	        this.snmp_username = source["snmp_username"];
	        this.created_at = this.convertValues(source["created_at"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Device {
	    id: string;
	    ip: string;
	    hostname: string;
	    vendor: string;
	    model: string;
	    os_version: string;
	    location: string;
	    uptime_seconds: number;
	    mac_address: string;
	    serial_number: string;
	    tags: string;
	    snmp_version: string;
	    snmp_port: number;
	    ssh_port: number;
	    credential_id: string;
	    description: string;
	    // Go type: time
	    last_seen_at?: any;
	    // Go type: time
	    created_at: any;
	    // Go type: time
	    updated_at: any;
	
	    static createFrom(source: any = {}) {
	        return new Device(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.ip = source["ip"];
	        this.hostname = source["hostname"];
	        this.vendor = source["vendor"];
	        this.model = source["model"];
	        this.os_version = source["os_version"];
	        this.location = source["location"];
	        this.uptime_seconds = source["uptime_seconds"];
	        this.mac_address = source["mac_address"];
	        this.serial_number = source["serial_number"];
	        this.tags = source["tags"];
	        this.snmp_version = source["snmp_version"];
	        this.snmp_port = source["snmp_port"];
	        this.ssh_port = source["ssh_port"];
	        this.credential_id = source["credential_id"];
	        this.description = source["description"];
	        this.last_seen_at = this.convertValues(source["last_seen_at"], null);
	        this.created_at = this.convertValues(source["created_at"], null);
	        this.updated_at = this.convertValues(source["updated_at"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Playbook {
	    id: string;
	    name: string;
	    description: string;
	    content: string;
	    // Go type: time
	    created_at: any;
	    // Go type: time
	    updated_at: any;
	
	    static createFrom(source: any = {}) {
	        return new Playbook(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.description = source["description"];
	        this.content = source["content"];
	        this.created_at = this.convertValues(source["created_at"], null);
	        this.updated_at = this.convertValues(source["updated_at"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ScheduledJob {
	    id: string;
	    name: string;
	    job_type: string;
	    cron_expression: string;
	    payload: string;
	    enabled: boolean;
	    // Go type: time
	    last_run_at?: any;
	    last_status: string;
	    // Go type: time
	    created_at: any;
	    // Go type: time
	    updated_at: any;
	
	    static createFrom(source: any = {}) {
	        return new ScheduledJob(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.job_type = source["job_type"];
	        this.cron_expression = source["cron_expression"];
	        this.payload = source["payload"];
	        this.enabled = source["enabled"];
	        this.last_run_at = this.convertValues(source["last_run_at"], null);
	        this.last_status = source["last_status"];
	        this.created_at = this.convertValues(source["created_at"], null);
	        this.updated_at = this.convertValues(source["updated_at"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace playbook {
	
	export class StepResult {
	    name: string;
	    command: string;
	    output: string;
	    passed: boolean;
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new StepResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.command = source["command"];
	        this.output = source["output"];
	        this.passed = source["passed"];
	        this.error = source["error"];
	    }
	}
	export class ExecutionResult {
	    DeviceID: string;
	    DeviceIP: string;
	    Steps: StepResult[];
	    Status: string;
	    TotalMs: number;
	
	    static createFrom(source: any = {}) {
	        return new ExecutionResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.DeviceID = source["DeviceID"];
	        this.DeviceIP = source["DeviceIP"];
	        this.Steps = this.convertValues(source["Steps"], StepResult);
	        this.Status = source["Status"];
	        this.TotalMs = source["TotalMs"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace ssh {
	
	export class Result {
	    DeviceID: string;
	    IP: string;
	    Outputs: Record<string, string>;
	    Error: any;
	    Duration: number;
	
	    static createFrom(source: any = {}) {
	        return new Result(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.DeviceID = source["DeviceID"];
	        this.IP = source["IP"];
	        this.Outputs = source["Outputs"];
	        this.Error = source["Error"];
	        this.Duration = source["Duration"];
	    }
	}

}

export namespace topology {
	
	export class Edge {
	    id: string;
	    source: string;
	    target: string;
	    label: string;
	
	    static createFrom(source: any = {}) {
	        return new Edge(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.source = source["source"];
	        this.target = source["target"];
	        this.label = source["label"];
	    }
	}
	export class RenderHint {
	    terminal_color: string;
	    show_poe_icon: boolean;
	    terminal_index: number;
	
	    static createFrom(source: any = {}) {
	        return new RenderHint(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.terminal_color = source["terminal_color"];
	        this.show_poe_icon = source["show_poe_icon"];
	        this.terminal_index = source["terminal_index"];
	    }
	}
	export class Node {
	    id: string;
	    label: string;
	    ip: string;
	    vendor: string;
	    model: string;
	    hint: RenderHint;
	    location: string;
	    status: string;
	
	    static createFrom(source: any = {}) {
	        return new Node(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.label = source["label"];
	        this.ip = source["ip"];
	        this.vendor = source["vendor"];
	        this.model = source["model"];
	        this.hint = this.convertValues(source["hint"], RenderHint);
	        this.location = source["location"];
	        this.status = source["status"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Graph {
	    nodes: Node[];
	    edges: Edge[];
	
	    static createFrom(source: any = {}) {
	        return new Graph(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.nodes = this.convertValues(source["nodes"], Node);
	        this.edges = this.convertValues(source["edges"], Edge);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	

}

