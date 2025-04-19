// ================================================================================
// FILE: backend/src/features/chat/agent/AgentEventEmitter.js
// PURPOSE: Handles emitting standardized events (primarily for SSE).
// PHASE 2 UPDATE: Include errorCode in emitToolResult payload.
// ================================================================================

const logger = require('../../../shared/utils/logger');

/**
 * Centralizes the emission of agent-related events, primarily for streaming updates (SSE).
 */
class AgentEventEmitter {
    /**
     * Initializes the emitter.
     * @param {function(string, object): void} sendEventCallback - The function to call to send an event (e.g., sendStreamEvent).
     * @param {object} contextInfo - Base information to include in every event payload.
     * @param {string} contextInfo.userId - User ID.
     * @param {string} contextInfo.sessionId - Chat Session ID.
     * @param {string} contextInfo.messageId - The ID of the AI message being processed.
     */
    constructor(sendEventCallback, contextInfo) {
        this.sendEventCallback = sendEventCallback;
        this.contextInfo = contextInfo; // { userId, sessionId, messageId }

        if (typeof sendEventCallback !== 'function') {
            logger.warn(`[AgentEventEmitter ${this.contextInfo.sessionId}] sendEventCallback is not a function. Events will not be sent via callback.`);
        }
         logger.debug(`[AgentEventEmitter ${this.contextInfo.sessionId}] Initialized for Message ${this.contextInfo.messageId}`);
    }

    /**
     * Internal helper to send events via the callback.
     * @private
     */
    _emit(eventName, payload) {
        if (typeof this.sendEventCallback !== 'function') return;

        const fullPayload = { ...this.contextInfo, ...payload };

        try {
            this.sendEventCallback(eventName, fullPayload);
            if (eventName !== 'token') {
                 logger.debug(`[AgentEventEmitter ${this.contextInfo.sessionId}] Sent event via callback: ${eventName}`, payload);
            }
        } catch (e) {
            logger.error(`[AgentEventEmitter ${this.contextInfo.sessionId}] sendEventCallback failed for event ${eventName}: ${e.message}`, e);
        }
    }

    // --- Specific Event Emitters ---

    /** Emits agent:thinking status with the reasoning text. */
    emitThinking(thinkingText = 'Processing...') {
        this._emit('agent:thinking', { thinking: thinkingText });
    }

    /** Emits agent:using_tool status. */
    emitUsingTool(toolName, args) {
         this._emit('agent:using_tool', { toolName, args });
    }

    /** Emits agent:tool_result status including optional error code. */
    emitToolResult(toolName, summary, error = null, errorCode = null) { // Added errorCode param
        this._emit('agent:tool_result', { toolName, resultSummary: summary, error, errorCode }); // Include errorCode
    }

    /** Emits agent:final_answer status with text and code. */
    emitFinalAnswer(text, aiGeneratedCode = null, analysisResult = null) {
         this._emit('agent:final_answer', {
             text: text,
             aiGeneratedCode: aiGeneratedCode,
             analysisResult: analysisResult
         });
     }

    /** Emits agent:error status. */
    emitAgentError(errorMsg, errorCode = null) { // Added optional errorCode
        this._emit('agent:error', { error: errorMsg, errorCode: errorCode }); // Include errorCode
    }

    /** Passes through token events received from the LLM stream callback. */
    emitStreamToken(token) {
        this._emit('token', { content: token });
    }

     /** Passes through 'finish' events from the LLM stream callback. */
     emitStreamFinish(reason) {
         this._emit('finish', { finishReason: reason });
     }

     /** Passes through generic 'completed' signal from the LLM stream callback. */
     emitStreamCompleted() {
         this._emit('completed', { finalContent: null });
     }

     /** Passes through error events from the LLM stream callback. */
     emitStreamError(errorMessage) {
         this._emit('error', { message: errorMessage });
     }
}

module.exports = AgentEventEmitter;