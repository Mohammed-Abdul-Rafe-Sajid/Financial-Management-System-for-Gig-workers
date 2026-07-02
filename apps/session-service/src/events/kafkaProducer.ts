/**
 * events/kafkaProducer.ts
 *
 * Publishes session.created, session.enriched, prediction.requested events.
 * Topics and payload shapes defined in API_CONTRACT.md §9 and TYPES.ts.
 *
 * Singleton pattern — call connect() once at startup, disconnect() on shutdown.
 */

import { Kafka, Producer, Partitioners } from 'kafkajs';
import { config } from '../config';
import {
  SessionCreatedEvent,
  SessionEnrichedEvent,
  PredictionRequestedEvent,
} from '../types';

class KafkaProducer {
  private producer: Producer;
  private connected = false;

  constructor() {
    const kafka = new Kafka({
      clientId: config.kafka.client_id,
      brokers: config.kafka.brokers,
      retry: { initialRetryTime: 300, retries: 5 },
    });
    this.producer = kafka.producer({
      createPartitioner: Partitioners.LegacyPartitioner,
    });
  }

  async connect(): Promise<void> {
    await this.producer.connect();
    this.connected = true;
    console.log(JSON.stringify({
      level: 'info',
      service: config.service_name,
      message: 'Kafka producer connected',
      brokers: config.kafka.brokers,
    }));
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.producer.disconnect();
      this.connected = false;
    }
  }

  private async publish(topic: string, payload: object): Promise<void> {
    if (!this.connected) {
      // Best-effort: log and continue rather than fail the HTTP request
      console.error(JSON.stringify({
        level: 'error',
        service: config.service_name,
        message: 'Kafka producer not connected — event not published',
        topic,
      }));
      return;
    }
    await this.producer.send({
      topic,
      messages: [{ value: JSON.stringify(payload) }],
    });
  }

  async publishSessionCreated(event: SessionCreatedEvent): Promise<void> {
    await this.publish('session.created', event);
    console.log(JSON.stringify({
      level: 'info',
      service: config.service_name,
      message: 'Published session.created',
      session_id: event.session_id,
      user_id: event.user_id,
    }));
  }

  async publishSessionEnriched(event: SessionEnrichedEvent): Promise<void> {
    await this.publish('session.enriched', event);
    console.log(JSON.stringify({
      level: 'info',
      service: config.service_name,
      message: 'Published session.enriched',
      session_id: event.session_id,
      user_id: event.user_id,
    }));
  }

  async publishPredictionRequested(event: PredictionRequestedEvent): Promise<void> {
    await this.publish('prediction.requested', event);
  }
}

// Singleton export
export const kafkaProducer = new KafkaProducer();
