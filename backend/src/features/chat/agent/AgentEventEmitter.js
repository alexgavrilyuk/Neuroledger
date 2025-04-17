// ================================================================================
// FILE: NeuroLedger copy/backend/src/features/chat/agent/AgentEventEmitter.js
// PURPOSE: Handles emitting standardized events (primarily for SSE).
// NEW FILE
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
            logger.warn(`[AgentEventEmitter ${this.contextInfo.sessionId}] sendEventCallback is not a function. Events will not be sent.`);
        }
         logger.debug(`[AgentEventEmitter ${this.contextInfo.sessionId}] Initialized for Message ${this.contextInfo.messageId}`);
    }

    /**
     * Internal helper to send events via the callback.
     * @private
     */
    _emit(eventName, payload) {
        if (typeof this.sendEventCallback !== 'function') return;

        // Combine base context with event-specific payload
        const fullPayload = {
            ...this.contextInfo,
            ...payload,
        };

        try {
            // Use the callback directly provided by AgentRunner
            this.sendEventCallback(eventName, fullPayload);
            // Reduced logging noise for tokens
            if (eventName !== 'token') {
                 logger.debug(`[AgentEventEmitter ${this.contextInfo.sessionId}] Sent event: ${eventName}`, payload);
            }
        } catch (e) {
            logger.error(`[AgentEventEmitter ${this.contextInfo.sessionId}] sendEventCallback failed for event ${eventName}: ${e.message}`, e);
        }
    }

    // --- Specific Event Emitters ---

    /** Emits agent:thinking status. */
    emitThinking() {
        this._emit('agent:thinking', {});
    }

    /** Emits agent:using_tool status. */
    emitUsingTool(toolName, args) {
        // Avoid logging potentially large args here, logged elsewhere
         this._emit('agent:using_tool', { toolName, args }); // Send full args for FE if needed
    }

    /** Emits agent:tool_result status. */
    emitToolResult(toolName, summary, error = null) {
        this._emit('agent:tool_result', { toolName, resultSummary: summary, error });
    }

    /** Emits agent:final_answer status with text and code. */
    emitFinalAnswer(text, aiGeneratedCode = null, analysisResult = null) {
         this._emit('agent:final_answer', {
             text: text,
             aiGeneratedCode: aiGeneratedCode,
             analysisResult: analysisResult // Include analysis result
         });
     }

    /** Emits agent:error status. */
    emitAgentError(errorMsg) {
        this._emit('agent:error', { error: errorMsg });
    }

    /** Passes through token events received from the LLM stream callback. */
    emitStreamToken(token) {
        // Forward token directly, it's already formatted { content: ... } by prompt service
        this._emit('token', { content: token });
    }

     /** Passes through 'finish' events from the LLM stream callback. */
     emitStreamFinish(reason) {
         this._emit('finish', { finishReason: reason });
     }

     /** Passes through generic 'completed' signal from the LLM stream callback. */
     emitStreamCompleted() {
         this._emit('completed', { finalContent: null }); // Payload structure matches prompt service
     }

     /** Passes through error events from the LLM stream callback. */
     emitStreamError(errorMessage) {
         this._emit('error', { message: errorMessage }); // Payload structure matches prompt service
     }
}

module.exports = AgentEventEmitter;