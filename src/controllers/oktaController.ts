/**
 * Okta controller for serving Okta-specific test data
 * Simulates the Okta API logs endpoint format
 */

import { Request, Response } from 'express';
import { Logger } from '../utils/logger';
import { ApiResponse } from '../types';

interface OktaLogEvent {
  actor: {
    id: string;
    type: string;
    alternateId: string;
    displayName: string;
    detailEntry: null;
  };
  client: {
    userAgent: {
      rawUserAgent: string;
      os: string;
      browser: string;
    };
    zone: string;
    device: string;
    id: null;
    ipAddress: string;
    geographicalContext: {
      city: string;
      state: string;
      country: string;
      postalCode: string;
      geolocation: {
        lat: number;
        lon: number;
      };
    };
  };
  device: null;
  authenticationContext: {
    authenticationProvider: null;
    credentialProvider: null;
    credentialType: null;
    issuer: null;
    interface: null;
    authenticationStep: number;
    externalSessionId: string;
  };
  displayMessage: string;
  eventType: string;
  outcome: {
    result: string;
    reason?: string;
  };
  published: string;
  securityContext: {
    asNumber: null;
    asOrg: null;
    isp: null;
    domain: null;
    isProxy: null;
  };
  severity: string;
  debugContext: {
    debugData: {
      tunnels?: string;
      requestId: string;
      requestUri?: string;
      threatSuspected: string;
      url?: string;
      dthash?: string;
      behaviors?: string;
      initiationType?: string;
      authnRequestId?: string;
      signOnMode?: string;
    };
  };
  legacyEventType: string;
  transaction: {
    type: string;
    id: string;
    detail: {};
  };
  uuid: string;
  version: string;
  request: {
    ipChain: Array<{
      ip: string;
      geographicalContext: {
        city: string;
        state: string;
        country: string;
        postalCode: string;
        geolocation: {
          lat: number;
          lon: number;
        };
      };
      version: string;
      source: null;
    }>;
  };
  target?: Array<{
    id: string;
    type: string;
    alternateId: string;
    displayName: string;
    detailEntry: any;
  }> | null;
}

export class OktaController {
  private logger: Logger;
  private seededRandom: () => number;

  // Sample data pools for realistic generation
  private readonly eventTypes = [
    'user.session.start',
    'user.authentication.sso',
    'user.session.end',
    'user.authentication.authenticate',
    'application.user_membership.add',
    'application.user_membership.remove',
    'user.account.lock',
    'user.account.unlock',
    'policy.evaluate_sign_on'
  ];

  private readonly severities = ['INFO', 'WARN', 'ERROR'];
  private readonly results = ['SUCCESS', 'FAILURE'];
  private readonly reasons = ['INVALID_CREDENTIALS', 'ACCOUNT_LOCKED', 'PASSWORD_EXPIRED', null];
  
  private readonly userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'MSFT-WIN-3/10.0.18363',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15'
  ];

  private readonly cities = [
    { city: 'New York', state: 'New York', country: 'United States', postalCode: '10001', lat: 40.7128, lon: -74.0060 },
    { city: 'London', state: 'England', country: 'United Kingdom', postalCode: 'SW1A', lat: 51.5074, lon: -0.1278 },
    { city: 'Tokyo', state: 'Tokyo', country: 'Japan', postalCode: '100-0001', lat: 35.6762, lon: 139.6503 },
    { city: 'Sydney', state: 'New South Wales', country: 'Australia', postalCode: '2000', lat: -33.8688, lon: 151.2093 },
    { city: 'Toronto', state: 'Ontario', country: 'Canada', postalCode: 'M5H 2N2', lat: 43.6532, lon: -79.3832 },
    { city: 'Calgary', state: 'Alberta', country: 'Canada', postalCode: 'T3B', lat: 51.0927, lon: -114.2017 }
  ];

  private readonly firstNames = ['John', 'Jane', 'Michael', 'Sarah', 'David', 'Emily', 'Robert', 'Lisa', 'James', 'Maria', 'Merlina', 'Alex'];
  private readonly lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Almendra', 'Chen'];
  private readonly domains = ['company.com', 'corp.org', 'enterprise.net', 'business.com', 'cwbank.com', 'testcorp.org'];

  constructor(logger: Logger) {
    this.logger = logger;
    this.seededRandom = this.createSeededRandom(Date.now());
  }

  /**
   * GET /api/v1/logs - Okta logs API endpoint simulation
   * Matches the format used by the Okta integration
   */
  public getLogs = async (req: Request, res: Response): Promise<void> => {
    try {
      const { since, until, limit = '1000', after } = req.query;
      const limitNumber = Math.min(parseInt(limit.toString(), 10) || 1000, 1000);

      this.logger.debug('Getting Okta logs', {
        requestId: req.context.requestId,
        since,
        until,
        limit: limitNumber,
        after
      });

      // Parse date ranges
      const sinceDate = since ? new Date(since.toString()) : new Date(Date.now() - 24 * 60 * 60 * 1000);
      const untilDate = until ? new Date(until.toString()) : new Date();

      // Generate events
      const events = this.generateOktaEvents(sinceDate, untilDate, limitNumber);

      // Add pagination headers if there are more results
      const headers: any = {};
      if (events.length === limitNumber) {
        const nextToken = this.generateNextToken();
        headers['Link'] = `</api/v1/logs?after=${nextToken}>; rel="next"`;
      }

      // Set headers
      Object.keys(headers).forEach(key => {
        res.set(key, headers[key]);
      });

      this.logger.info('Okta logs retrieved successfully', {
        requestId: req.context.requestId,
        eventCount: events.length,
        since: sinceDate.toISOString(),
        until: untilDate.toISOString()
      });

      // Return events array directly (Okta API format)
      res.status(200).json(events);
    } catch (error) {
      this.handleError(error, req, res, 'Error retrieving Okta logs');
    }
  };

  /**
   * Generate Okta log events for the specified time range
   */
  private generateOktaEvents(sinceDate: Date, untilDate: Date, limit: number): OktaLogEvent[] {
    const events: OktaLogEvent[] = [];
    const timeSpan = untilDate.getTime() - sinceDate.getTime();
    const eventInterval = timeSpan / limit;

    for (let i = 0; i < limit; i++) {
      const eventTime = new Date(sinceDate.getTime() + (i * eventInterval) + (this.seededRandom() * eventInterval * 0.5));
      const event = this.generateSingleEvent(eventTime);
      events.push(event);
    }

    // Sort by published time
    events.sort((a, b) => new Date(a.published).getTime() - new Date(b.published).getTime());
    
    return events;
  }

  /**
   * Generate a single Okta event
   */
  private generateSingleEvent(timestamp: Date): OktaLogEvent {
    const eventType = this.randomChoice(this.eventTypes);
    const severity = this.randomChoice(this.severities);
    const result = this.randomChoice(this.results);
    const userAgent = this.randomChoice(this.userAgents);
    const location = this.randomChoice(this.cities);
    const firstName = this.randomChoice(this.firstNames);
    const lastName = this.randomChoice(this.lastNames);
    const domain = this.randomChoice(this.domains);
    
    const userId = this.generateUserId();
    const displayName = `${firstName} ${lastName}`;
    const alternateId = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domain}`;
    const requestId = this.generateRequestId();
    const transactionId = this.generateRequestId();
    const uuid = this.generateUuid();

    // Generate IP addresses
    const ipv4 = this.generateIPv4();
    const ipv6 = this.generateIPv6();
    const useIpv6 = this.seededRandom() < 0.3; // 30% chance of IPv6

    const event: OktaLogEvent = {
      actor: {
        id: userId,
        type: "User",
        alternateId,
        displayName,
        detailEntry: null
      },
      client: {
        userAgent: {
          rawUserAgent: userAgent,
          os: this.extractOS(userAgent),
          browser: this.extractBrowser(userAgent)
        },
        zone: "null",
        device: "Computer",
        id: null,
        ipAddress: useIpv6 ? ipv6 : ipv4,
        geographicalContext: {
          city: location.city,
          state: location.state,
          country: location.country,
          postalCode: location.postalCode,
          geolocation: {
            lat: location.lat,
            lon: location.lon
          }
        }
      },
      device: null,
      authenticationContext: {
        authenticationProvider: null,
        credentialProvider: null,
        credentialType: null,
        issuer: null,
        interface: null,
        authenticationStep: 0,
        externalSessionId: this.generateSessionId()
      },
      displayMessage: this.getDisplayMessage(eventType),
      eventType,
      outcome: {
        result,
        reason: result === 'FAILURE' ? this.randomChoice(this.reasons.filter(r => r !== null)) : undefined
      },
      published: timestamp.toISOString(),
      securityContext: {
        asNumber: null,
        asOrg: null,
        isp: null,
        domain: null,
        isProxy: null
      },
      severity,
      debugContext: {
        debugData: this.generateDebugData(eventType, requestId)
      },
      legacyEventType: this.getLegacyEventType(eventType),
      transaction: {
        type: "WEB",
        id: transactionId,
        detail: {}
      },
      uuid,
      version: "0",
      request: {
        ipChain: [
          {
            ip: useIpv6 ? ipv6 : ipv4,
            geographicalContext: {
              city: location.city,
              state: location.state,
              country: location.country,
              postalCode: location.postalCode,
              geolocation: {
                lat: location.lat,
                lon: location.lon
              }
            },
            version: useIpv6 ? "V6" : "V4",
            source: null
          }
        ]
      }
    };

    // Initialize target as null (matching fixture format)
    event.target = null;

    // Add additional IP in chain sometimes
    if (this.seededRandom() < 0.3) {
      event.request.ipChain.push({
        ip: this.generateIPv4(),
        geographicalContext: {
          city: location.city,
          state: location.state,
          country: location.country,
          postalCode: location.postalCode,
          geolocation: {
            lat: location.lat,
            lon: location.lon
          }
        },
        version: "V4",
        source: null
      });
    }

    // Add target for SSO events (as array when present)
    if (eventType.includes('sso') || eventType.includes('authentication')) {
      event.target = [{
        id: this.generateAppId(),
        type: "AppInstance",
        alternateId: "Test Application",
        displayName: "Test Application",
        detailEntry: {
          signOnModeType: "SAML_2_0"
        }
      }];
    }

    return event;
  }

  private generateDebugData(eventType: string, requestId: string): any {
    const debugData: any = {
      requestId,
      threatSuspected: "false"
    };

    if (eventType === 'user.session.start') {
      debugData.requestUri = "/app/office365/exko3mlo8PTEu3ROR4x6/sso/wsfed/active";
      debugData.url = "/app/office365/exko3mlo8PTEu3ROR4x6/sso/wsfed/active?";
      debugData.dthash = "hash";
      debugData.behaviors = "{New Geo-Location=POSITIVE, New Device=POSITIVE, New IP=NEGATIVE, New State=NEGATIVE, New Country=Positive, Velocity=NEGATIVE, New City=NEGATIVE}";
      
      if (this.seededRandom() < 0.4) {
        debugData.tunnels = '[{"anonymous":true,"operator":"WITOPIA_VPN","type":"VPN"}]';
      }
    } else if (eventType === 'user.authentication.sso') {
      debugData.initiationType = "SP_INITIATED";
      debugData.authnRequestId = this.generateRequestId();
      debugData.signOnMode = "SAML 2.0";
      debugData.requestUri = "/app/testapp/exk10p13h5nhylKDa357/sso/saml";
      debugData.url = "random_url";
    }

    return debugData;
  }

  // Helper methods for generating realistic data
  private randomChoice<T>(array: T[]): T {
    if (array.length === 0) {
      throw new Error('Cannot choose from empty array');
    }
    return array[Math.floor(this.seededRandom() * array.length)] as T;
  }

  private generateUserId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '00u';
    for (let i = 0; i < 17; i++) {
      result += chars.charAt(Math.floor(this.seededRandom() * chars.length));
    }
    return result;
  }

  private generateRequestId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@-_';
    let result = '';
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(this.seededRandom() * chars.length));
    }
    return result;
  }

  private generateAppId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '0oa';
    for (let i = 0; i < 17; i++) {
      result += chars.charAt(Math.floor(this.seededRandom() * chars.length));
    }
    return result;
  }

  private generateSessionId(): string {
    // Sometimes return 'unknown' like in fixture, sometimes generate a session ID
    if (this.seededRandom() < 0.3) {
      return 'unknown';
    }
    
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let result = '';
    for (let i = 0; i < 25; i++) {
      result += chars.charAt(Math.floor(this.seededRandom() * chars.length));
    }
    return result;
  }

  private generateUuid(): string {
    const chars = 'abcdef0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(this.seededRandom() * chars.length));
    }
    result += '-';
    for (let i = 0; i < 4; i++) {
      result += chars.charAt(Math.floor(this.seededRandom() * chars.length));
    }
    result += '-';
    result += '11ec'; // Fixed part
    result += '-';
    for (let i = 0; i < 4; i++) {
      result += chars.charAt(Math.floor(this.seededRandom() * chars.length));
    }
    result += '-';
    for (let i = 0; i < 12; i++) {
      result += chars.charAt(Math.floor(this.seededRandom() * chars.length));
    }
    return result;
  }

  private generateIPv4(): string {
    return `${Math.floor(this.seededRandom() * 255)}.${Math.floor(this.seededRandom() * 255)}.${Math.floor(this.seededRandom() * 255)}.${Math.floor(this.seededRandom() * 255)}`;
  }

  private generateIPv6(): string {
    const segments = [];
    for (let i = 0; i < 8; i++) {
      const segment = Math.floor(this.seededRandom() * 65535).toString(16);
      segments.push(segment.padStart(4, '0'));
    }
    return segments.join(':');
  }

  private generateNextToken(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  private getLegacyEventType(eventType: string): string {
    const mapping: { [key: string]: string } = {
      'user.session.start': 'core.user_auth.login_failed',
      'user.authentication.sso': 'app.auth.sso',
      'user.session.end': 'core.user_auth.logout',
      'user.authentication.authenticate': 'core.user_auth.login_success',
      'application.user_membership.add': 'app.user_membership.add',
      'application.user_membership.remove': 'app.user_membership.remove',
      'user.account.lock': 'core.user.config.user_status.lock',
      'user.account.unlock': 'core.user.config.user_status.unlock',
      'policy.evaluate_sign_on': 'core.user_auth.login_success'
    };
    return mapping[eventType] || 'core.user_auth.login_failed';
  }

  private getDisplayMessage(eventType: string): string {
    const mapping: { [key: string]: string } = {
      'user.session.start': 'User login to Okta',
      'user.authentication.sso': 'User single sign on to app',
      'user.session.end': 'User logout from Okta',
      'user.authentication.authenticate': 'Authentication of user via MFA',
      'application.user_membership.add': 'Add user to application membership',
      'application.user_membership.remove': 'Remove user from application membership',
      'user.account.lock': 'Lock user account',
      'user.account.unlock': 'Unlock user account',
      'policy.evaluate_sign_on': 'Evaluate sign-on policy'
    };
    return mapping[eventType] || 'User authentication event';
  }

  private extractOS(userAgent: string): string {
    if (userAgent.includes('Windows NT 10.0')) return 'Windows 10';
    if (userAgent.includes('Windows NT')) return 'Windows';
    if (userAgent.includes('Mac OS X')) return 'Mac OS X';
    if (userAgent.includes('Linux')) return 'Linux';
    if (userAgent.includes('iPhone')) return 'iOS';
    if (userAgent.includes('Android')) return 'Android';
    if (userAgent.includes('MSFT-WIN')) return 'Windows';
    return 'UNKNOWN';
  }

  private extractBrowser(userAgent: string): string {
    if (userAgent.includes('Chrome')) return 'CHROME';
    if (userAgent.includes('Firefox')) return 'FIREFOX';
    if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'SAFARI';
    if (userAgent.includes('Edge')) return 'EDGE';
    return 'UNKNOWN';
  }

  private createSeededRandom(seed: number): () => number {
    let currentSeed = seed;
    return () => {
      currentSeed = (currentSeed * 9301 + 49297) % 233280;
      return currentSeed / 233280;
    };
  }

  /**
   * Handle controller errors
   */
  private handleError(
    error: unknown,
    req: Request,
    res: Response,
    message: string
  ): void {
    this.logger.error(message, {
      requestId: req.context.requestId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    const response: ApiResponse = {
      success: false,
      error: 'Internal server error',
      message,
      timestamp: new Date().toISOString(),
      requestId: req.context.requestId
    };

    res.status(500).json(response);
  }
}
