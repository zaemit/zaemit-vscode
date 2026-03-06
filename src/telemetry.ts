import * as vscode from 'vscode';
import TelemetryReporter from '@vscode/extension-telemetry';

const CONNECTION_STRING = 'InstrumentationKey=a834529d-e020-4029-bd9e-e5b43a3b18e7;IngestionEndpoint=https://koreacentral-0.in.applicationinsights.azure.com/;LiveEndpoint=https://koreacentral.livediagnostics.monitor.azure.com/;ApplicationId=00f280bb-8678-4f8c-ba8d-12d21900ab91';

let reporter: TelemetryReporter | null = null;

export function initTelemetry(context: vscode.ExtensionContext): void {
    reporter = new TelemetryReporter(CONNECTION_STRING);
    context.subscriptions.push(reporter);

    // DAU: extension activated
    sendEvent('extension_activated', {
        version: context.extension.packageJSON.version,
        vscodeVersion: vscode.version,
        language: vscode.env.language,
        platform: process.platform,
    });
}

export function sendEvent(name: string, properties?: Record<string, string>, measurements?: Record<string, number>): void {
    reporter?.sendTelemetryEvent(name, properties, measurements);
}

export function sendError(name: string, properties?: Record<string, string>, measurements?: Record<string, number>): void {
    reporter?.sendTelemetryErrorEvent(name, properties, measurements);
}

export function disposeTelemetry(): void {
    reporter?.dispose();
    reporter = null;
}

/**
 * 에디터 세션 타이머
 * open/close 시점을 기록하여 세션 시간을 측정
 */
export class SessionTimer {
    private startTime: number;

    constructor() {
        this.startTime = Date.now();
    }

    /** 세션 종료 시 경과 시간(초)을 반환하고 이벤트 전송 */
    end(properties?: Record<string, string>): number {
        const durationSec = Math.round((Date.now() - this.startTime) / 1000);
        sendEvent('editor_session_end', {
            ...properties,
        }, {
            durationSeconds: durationSec,
        });
        return durationSec;
    }
}
