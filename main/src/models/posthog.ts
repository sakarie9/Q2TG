import { PostHog } from 'posthog-node';
import os from 'os';
import env from './env';

const client = new PostHog(
  'phc_LmyAmIzRPk8Eoy5kMCFhwKVckY11vQS3KbGba2q4Hhm',
  { host: 'https://eu.i.posthog.com' },
);

const hostname = os.hostname();

if (env.POSTHOG_OPTOUT) {
  client.optOut();
}
else {
  client.optIn();
}

export default {
  capture(event: string, properties: Record<string, any>) {
    client.capture({
      event, properties,
      distinctId: hostname,
    });
  },
};
