// backend/src/features/chat/agent/AgentEventEmitter.js
// ENTIRE FILE - FULLY UPDATED

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
            if (eventName !== 'token') { // Avoid logging every single token
                 logger.debug(`[AgentEventEmitter ${this.contextInfo.sessionId}] Sent event via callback: ${eventName}`, payload);
            }
        } catch (e) {
            logger.error(`[AgentEventEmitter ${this.contextInfo.sessionId}] sendEventCallback failed for event ${eventName}: ${e.message}`, e);
        }
    }

    // --- Specific Event Emitters ---

    /** Emits agent:thinking status (internal thinking, less critical for UI). */
    emitThinking(thinkingText = 'Processing...') {
        // Maybe don't emit this to FE anymore if userExplanation is primary
        // this._emit('agent:thinking', { thinking: thinkingText });
        logger.debug(`[AgentEventEmitter ${this.contextInfo.sessionId}] Internal thinking occurred (not emitted to FE).`);
    }

    /** **NEW:** Emits agent:explanation status with user-friendly text. */
    emitUserExplanation(explanationText) {
        this._emit('agent:explanation', { explanation: explanationText });
    }

    /** Emits agent:using_tool status. */
    emitUsingTool(toolName, args) {
         // Sanitize args before emitting if needed (e.g., remove large code blocks)
         const loggedArgs = { ...args };
         if (loggedArgs.code) loggedArgs.code = '[code omitted]';
         this._emit('agent:using_tool', { toolName, args: loggedArgs });
    }

    /** Emits agent:tool_result status including optional error code. */
    emitToolResult(toolName, summary, error = null, errorCode = null) {
        this._emit('agent:tool_result', { toolName, resultSummary: summary, error, errorCode });
    }

    /** Emits agent:final_answer status with text and code/data. */
    emitFinalAnswer(text, aiGeneratedCode = null, analysisResult = null) {
         // Summarize analysisResult if it's large before emitting
         let resultSummary = analysisResult ? '[Analysis Data Present]' : null;
         if (analysisResult) {
             try { resultSummary = JSON.stringify(analysisResult).substring(0, 100) + '...'; } catch { /* ignore */ }
         }
         this._emit('agent:final_answer', {
             text: text,
             // Maybe don't emit full code/data in event? UI gets it from message state.
             // aiGeneratedCode: aiGeneratedCode ? '[Code Generated]' : null,
             // analysisResult: resultSummary
             // Send full data for now, FE might need it directly from event in some cases
             aiGeneratedCode: aiGeneratedCode,
             analysisResult: analysisResult
         });
     }

    /** Emits agent:error status. */
    emitAgentError(errorMsg, errorCode = null) {
        this._emit('agent:error', { error: errorMsg, errorCode: errorCode });
    }

    /** Emits agent:needs_clarification event. */
    emitNeedsClarification(question) {
        this._emit('agent:needs_clarification', { question: question });
    }

    // --- Stream Passthrough Emitters ---

    /** Passes through token events received from the LLM stream callback. */
    emitStreamToken(token) {
        // Only emit if token has content
        if (token && token.trim()) {
            this._emit('token', { content: token });
        }
    }

     /** Passes through 'finish' events from the LLM stream callback. */
     emitStreamFinish(reason) {
         this._emit('finish', { finishReason: reason });
     }

     /** Passes through generic 'completed' signal from the LLM stream callback. */
     emitStreamCompleted() {
         // Maybe don't need this if 'end' event is reliable
         // this._emit('completed', { finalContent: null });
     }

     /** Passes through error events from the LLM stream callback. */
     emitStreamError(errorMessage) {
         this._emit('error', { message: errorMessage }); // Use the standard 'error' event type
     }
}

module.exports = AgentEventEmitter;