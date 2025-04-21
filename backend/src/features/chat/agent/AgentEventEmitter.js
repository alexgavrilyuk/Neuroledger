// backend/src/features/chat/agent/AgentEventEmitter.js
// ENTIRE FILE - UPDATED FOR PHASE 9, 12

const logger = require('../../../shared/utils/logger');

/**
 * Centralizes the emission of agent-related events, primarily for streaming updates (SSE).
 */
class AgentEventEmitter {
    constructor(sendEventCallback, contextInfo) {
        this.sendEventCallback = sendEventCallback;
        this.contextInfo = contextInfo; // { userId, sessionId, messageId }

        if (typeof sendEventCallback !== 'function') {
            logger.warn(`[AgentEventEmitter ${this.contextInfo.sessionId}] sendEventCallback is not a function. Events will not be sent via callback.`);
        }
         logger.debug(`[AgentEventEmitter ${this.contextInfo.sessionId}] Initialized for Message ${this.contextInfo.messageId}`);
    }

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
        // No longer emitting internal thinking to FE
        logger.debug(`[AgentEventEmitter ${this.contextInfo.sessionId}] Internal thinking occurred (not emitted to FE).`);
    }

    /** **PHASE 12:** Emits agent:explanation status with user-friendly text. */
    emitUserExplanation(explanationText) {
        this._emit('agent:explanation', { explanation: explanationText });
    }

    /** Emits agent:using_tool status. */
    emitUsingTool(toolName, args) {
         const loggedArgs = { ...args };
         if (loggedArgs.code) loggedArgs.code = '[code omitted]';
         if (loggedArgs.react_code) loggedArgs.react_code = '[code omitted]';
         this._emit('agent:using_tool', { toolName, args: loggedArgs });
    }

    /** Emits agent:tool_result status including optional error code. */
    emitToolResult(toolName, summary, error = null, errorCode = null) {
        this._emit('agent:tool_result', { toolName, resultSummary: summary, error, errorCode });
    }

    /** Emits agent:final_answer status with text and code/data. */
    emitFinalAnswer(text, aiGeneratedCode = null, analysisResult = null) {
         let resultSummary = analysisResult ? '[Analysis Data Present]' : null;
         if (analysisResult) {
             try { resultSummary = JSON.stringify(analysisResult).substring(0, 100) + '...'; } catch { /* ignore */ }
         }
         this._emit('agent:final_answer', {
             text: text,
             aiGeneratedCode: aiGeneratedCode,
             analysisResult: analysisResult
         });
     }

    /** Emits agent:error status. */
    emitAgentError(errorMsg, errorCode = null) {
        this._emit('agent:error', { error: errorMsg, errorCode: errorCode });
    }

    /** **PHASE 9:** Emits agent:needs_clarification event. */
    emitNeedsClarification(question) {
        this._emit('agent:needs_clarification', { question: question });
    }

    // --- Stream Passthrough Emitters ---

    /** Passes through token events received from the LLM stream callback. */
    emitStreamToken(token) {
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
         // this._emit('completed', { finalContent: null }); // Not strictly needed if 'end' is used
     }

     /** Passes through error events from the LLM stream callback. */
     emitStreamError(errorMessage) {
         this._emit('error', { message: errorMessage }); // Use the standard 'error' event type
     }
}

module.exports = AgentEventEmitter;