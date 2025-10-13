class OutlookHandler {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.baseUrl = 'https://graph.microsoft.com/v1.0';
    this.maxRetries = 3;
    this.retryDelay = 1000;
  }

  async withRetry(operation, retries = this.maxRetries) {
    try {
      return await operation();
    } catch (error) {
      if (retries > 0 && this.isRetryableError(error)) {
        await this.delay(this.retryDelay);
        return this.withRetry(operation, retries - 1);
      }
      throw error;
    }
  }

  isRetryableError(error) {
    const retryableCodes = ['ErrorItemNotFound', 'TooManyRequests', 'ServiceUnavailable'];
    return error.status >= 500 || retryableCodes.some(code => error.message?.includes(code));
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async validateItemExists(messageId) {
    try {
      const response = await fetch(`${this.baseUrl}/me/messages/${messageId}`, {
        headers: { 'Authorization': `Bearer ${this.accessToken}` }
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async moveMessage(messageId, targetFolderId) {
    return this.withRetry(async () => {
      // Validate item exists before attempting move
      if (!(await this.validateItemExists(messageId))) {
        throw new Error(`Message ${messageId} not found - skipping move operation`);
      }

      const response = await fetch(`${this.baseUrl}/me/messages/${messageId}/move`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ destinationId: targetFolderId })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Move failed: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      return response.json();
    });
  }

  async markAsRead(messageId) {
    return this.withRetry(async () => {
      if (!(await this.validateItemExists(messageId))) {
        throw new Error(`Message ${messageId} not found - skipping mark as read`);
      }

      const response = await fetch(`${this.baseUrl}/me/messages/${messageId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ isRead: true })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Mark as read failed: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      return response.json();
    });
  }
}

module.exports = OutlookHandler;
