import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SEED_WALKTHROUGHS = [
  {
    appId: 'novapay-dashboard',
    createdBy: 'seed-author',
    definition: {
      title: 'Set Purchase Limits',
      description: 'Walk through setting daily and monthly spending limits on your card.',
      tags: ['onboarding', 'card-settings', 'security'],
      audienceRules: { roles: ['customer'] },
      priority: 100,
      schedule: {},
      rateLimit: { maxPerUser: 3, maxPerSession: 1, cooldownMinutes: 60 },
      language: 'en',
      translations: {},
      steps: [
        {
          id: 'step-1',
          order: 0,
          selector: {
            primary: '[data-nav="card-settings"]',
            fallbacks: ['.nav-item:nth-child(5)', 'a[href="/settings"]'],
            textContent: 'Card Settings',
            ariaLabel: 'Card Settings',
            domPath: 'nav > div:nth-child(5)',
            visualHash: '',
            boundingBox: { x: 0, y: 200, width: 220, height: 40 },
          },
          actionType: 'click',
          title: 'Navigate to Card Settings',
          description: 'Click on Card Settings in the sidebar to access spending controls.',
          tooltipPosition: 'right',
          appContext: { appId: 'novapay-dashboard', appName: 'NovaPay' },
          triggersNavigation: true,
        },
        {
          id: 'step-2',
          order: 1,
          selector: {
            primary: '#section-limits',
            fallbacks: ['.settings-section:first-child'],
            textContent: 'Purchase Limits',
            ariaLabel: '',
            domPath: '.settings-grid > div:first-child',
            visualHash: '',
            boundingBox: { x: 240, y: 120, width: 400, height: 300 },
          },
          actionType: 'click',
          title: 'Purchase Limits Section',
          description: 'This is where you control daily, monthly, and per-transaction spending caps.',
          tooltipPosition: 'right',
          appContext: { appId: 'novapay-dashboard', appName: 'NovaPay' },
          expectedUrl: '/settings',
        },
        {
          id: 'step-3',
          order: 2,
          selector: {
            primary: '#input-daily-limit',
            fallbacks: ['input[name="dailyLimit"]'],
            textContent: '',
            ariaLabel: 'Daily Purchase Limit',
            domPath: '.form-group:first-child input',
            visualHash: '',
            boundingBox: { x: 260, y: 220, width: 360, height: 40 },
          },
          actionType: 'input',
          actionValue: '$2,000.00',
          title: 'Set Your Daily Limit',
          description: 'Enter the maximum you want to spend per day. We recommend starting with $2,000.',
          tooltipPosition: 'right',
          appContext: { appId: 'novapay-dashboard', appName: 'NovaPay' },
        },
        {
          id: 'step-4',
          order: 3,
          selector: {
            primary: '#input-monthly-limit',
            fallbacks: ['input[name="monthlyLimit"]'],
            textContent: '',
            ariaLabel: 'Monthly Purchase Limit',
            domPath: '.form-group:nth-child(2) input',
            visualHash: '',
            boundingBox: { x: 260, y: 290, width: 360, height: 40 },
          },
          actionType: 'input',
          actionValue: '$10,000.00',
          title: 'Set Your Monthly Limit',
          description: 'This caps total monthly spending. Most users set between $5,000–$15,000.',
          tooltipPosition: 'right',
          appContext: { appId: 'novapay-dashboard', appName: 'NovaPay' },
        },
        {
          id: 'step-5',
          order: 4,
          selector: {
            primary: '#btn-save-limits',
            fallbacks: ['button.btn-save', 'button:contains("Save")'],
            textContent: 'Save Limits',
            ariaLabel: 'Save Limits',
            domPath: '.settings-section button.btn-save',
            visualHash: '',
            boundingBox: { x: 260, y: 380, width: 120, height: 40 },
          },
          actionType: 'click',
          title: 'Save Your Settings',
          description: 'Click Save to apply your new limits. They take effect immediately.',
          tooltipPosition: 'top',
          appContext: { appId: 'novapay-dashboard', appName: 'NovaPay' },
        },
      ],
    },
    publish: true,
  },
  {
    appId: 'novapay-dashboard',
    createdBy: 'seed-author',
    definition: {
      title: 'Make Your First Payment',
      description: 'Learn how to send a payment to anyone in just a few steps.',
      tags: ['onboarding', 'payments'],
      audienceRules: { roles: ['customer'] },
      priority: 90,
      schedule: {},
      rateLimit: { maxPerUser: 3, maxPerSession: 1, cooldownMinutes: 120 },
      language: 'en',
      translations: {},
      steps: [
        {
          id: 'pay-1',
          order: 0,
          selector: {
            primary: '[data-nav="payments"]',
            fallbacks: [],
            textContent: 'Payments',
            ariaLabel: 'Payments',
            domPath: 'nav > div:nth-child(3)',
            visualHash: '',
            boundingBox: { x: 0, y: 160, width: 220, height: 40 },
          },
          actionType: 'click',
          title: 'Go to Payments',
          description: 'Click Payments in the sidebar to get started.',
          tooltipPosition: 'right',
          appContext: { appId: 'novapay-dashboard', appName: 'NovaPay' },
          triggersNavigation: true,
        },
      ],
    },
    publish: false, // leave as draft
  },
  {
    appId: 'novapay-dashboard',
    createdBy: 'seed-author',
    definition: {
      title: 'Escalate Suspicious Payee Across Apps',
      description: 'Start in NovaPay settings and continue in NovaConnect operations to review a risky payee.',
      tags: ['cross-app', 'operations', 'risk-review'],
      audienceRules: { roles: ['customer'] },
      priority: 95,
      schedule: {},
      rateLimit: { maxPerUser: 3, maxPerSession: 1, cooldownMinutes: 90 },
      language: 'en',
      translations: {},
      steps: [
        {
          id: 'cross-1',
          order: 0,
          selector: {
            primary: '[data-nav="card-settings"]',
            fallbacks: ['a[href="/settings"]'],
            textContent: 'Card Settings',
            ariaLabel: 'Card Settings',
            domPath: 'nav > a:nth-child(5)',
            visualHash: '',
            boundingBox: { x: 0, y: 200, width: 220, height: 40 },
          },
          actionType: 'click',
          title: 'Open Card Settings',
          description: 'Go to Card Settings to trigger the cross-app risk workflow.',
          tooltipPosition: 'right',
          appContext: { appId: 'novapay-dashboard', appName: 'NovaPay' },
          triggersNavigation: true,
        },
        {
          id: 'cross-2',
          order: 1,
          selector: {
            primary: '#btn-save-limits',
            fallbacks: ['button#btn-save-limits'],
            textContent: 'Save Limits',
            ariaLabel: 'Save Limits',
            domPath: 'main button:nth-child(1)',
            visualHash: '',
            boundingBox: { x: 260, y: 380, width: 120, height: 40 },
          },
          actionType: 'cross_app_transition',
          title: 'Continue In NovaConnect',
          description: 'Click here to jump into NovaConnect and continue the guided payee risk review.',
          tooltipPosition: 'top',
          appContext: { appId: 'novapay-dashboard', appName: 'NovaPay' },
          expectedUrl: '/settings',
          transitionConfig: {
            sourceAppId: 'novapay-dashboard',
            targetAppId: 'novaconnect-ops',
            targetUrlPattern: 'http://localhost:3200',
            navigationTrigger: 'manual',
            ttlSeconds: 300,
            urlParamKey: '_lumino',
            showTransitionIndicator: true,
            fallbackMessage: 'Open NovaConnect to continue this guide.',
          },
        },
        {
          id: 'cross-3',
          order: 2,
          selector: {
            primary: '#btn-review-payee',
            fallbacks: ['button#btn-review-payee'],
            textContent: 'Review Payee',
            ariaLabel: 'Review Payee',
            domPath: 'main button:nth-child(1)',
            visualHash: '',
            boundingBox: { x: 900, y: 350, width: 200, height: 40 },
          },
          actionType: 'click',
          title: 'Review Payee In NovaConnect',
          description: 'Continue the workflow by opening the payee review in NovaConnect.',
          tooltipPosition: 'left',
          appContext: { appId: 'novaconnect-ops', appName: 'NovaConnect' },
          expectedUrl: '/',
        },
        {
          id: 'cross-4',
          order: 3,
          selector: {
            primary: '#risk-snapshot',
            fallbacks: ['#risk-snapshot'],
            textContent: 'Risk Snapshot',
            ariaLabel: '',
            domPath: 'main div:nth-child(1)',
            visualHash: '',
            boundingBox: { x: 860, y: 220, width: 300, height: 120 },
          },
          actionType: 'hover',
          title: 'Check Risk Snapshot',
          description: 'Hover the risk snapshot to validate the review context before escalation.',
          tooltipPosition: 'left',
          appContext: { appId: 'novaconnect-ops', appName: 'NovaConnect' },
          expectedUrl: '/',
        },
      ],
    },
    publish: true,
  },
];

async function seed() {
  console.log('Seeding database...');

  for (const wt of SEED_WALKTHROUGHS) {
    const walkthrough = await prisma.walkthrough.create({
      data: {
        appId: wt.appId,
        status: wt.publish ? 'PUBLISHED' : 'DRAFT',
        currentVersion: 1,
        createdBy: wt.createdBy,
        ...(wt.publish && { publishedAt: new Date(), publishedBy: wt.createdBy }),
      },
    });

    await prisma.walkthroughVersion.create({
      data: {
        walkthroughId: walkthrough.id,
        version: 1,
        definition: wt.definition as any,
        createdBy: wt.createdBy,
      },
    });

    console.log(`  Created: "${wt.definition.title}" (${wt.publish ? 'published' : 'draft'})`);
  }

  console.log('Seed complete.');
}

seed()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
