type PropertyContract = {
  readonly required: readonly string[];
  readonly optional: readonly string[];
};

const FIELD_CONTRACTS = {
  shortText: {
    required: ['id', 'type', 'label'],
    optional: ['helpText', 'required', 'layout', 'placeholder', 'minLength', 'maxLength'],
  },
  longText: {
    required: ['id', 'type', 'label'],
    optional: ['helpText', 'required', 'layout', 'placeholder', 'rows', 'minLength', 'maxLength'],
  },
  rating: {
    required: ['id', 'type', 'label'],
    optional: ['helpText', 'required', 'layout', 'scale', 'icon', 'lowLabel', 'highLabel'],
  },
  singleChoice: {
    required: ['id', 'type', 'label', 'options'],
    optional: ['helpText', 'required', 'layout', 'display'],
  },
  checkbox: {
    required: ['id', 'type', 'label'],
    optional: ['helpText', 'required', 'initialValue', 'layout'],
  },
  attachments: {
    required: ['id', 'type', 'label'],
    optional: ['helpText', 'required', 'maxFiles', 'maxFileSize', 'accept', 'layout'],
  },
} as const satisfies Record<string, PropertyContract>;

const SCREEN_CONTRACTS = {
  message: {
    required: ['id', 'type', 'title'],
    optional: ['when', 'description', 'continueLabel'],
  },
  form: {
    required: ['id', 'type', 'form'],
    optional: ['when', 'continueLabel', 'backLabel'],
  },
  screenshot: {
    required: ['id', 'type', 'mode'],
    optional: ['when', 'title', 'description', 'continueLabel', 'backLabel'],
  },
} as const satisfies Record<string, PropertyContract>;

const TRANSITION_KINDS = [
  'none',
  'slide-horizontal',
  'slide-vertical',
  'fade',
  'scale-fade',
  'custom',
] as const;

/**
 * The canonical documentation inventory for the released BugDrop Flow API.
 * Fixture tests bind the documented runtime bounds below to released source.
 */
export const FLOW_CAPABILITIES = {
  versionKey: 'v1.56.3@47a392d1e7b1a8d8adeff1692f6bbbd84696280d',
  release: 'v1.56.3',
  targetCommit: '47a392d1e7b1a8d8adeff1692f6bbbd84696280d',
  runtime: {
    byteLength: 238_591,
    sha256: '338cdb5b19c69dc3429fdcb8f800e3b98a3bdd442fee78563523cd731e2bdf0e',
  },
  publicContract: {
    CheckboxField:
      "interface CheckboxField{id:string;type:'checkbox';label:string;helpText?:string;required?:boolean;initialValue?:boolean;layout?:{span?:1|2};}",
    AttachmentsField:
      "interface AttachmentsField{id:string;type:'attachments';label:string;helpText?:string;required?:boolean;maxFiles?:number;maxFileSize?:number;accept?:string[];layout?:{span?:1|2};}",
    FlowField: 'type FlowField = VariantField|CheckboxField|AttachmentsField;',
    FlowScalar: 'type FlowScalar = string|number|boolean|null;',
    FlowCondition:
      'type FlowCondition =|{answer:string;equals:FlowScalar}|{context:string;equals:FlowScalar}|{all:FlowCondition[]}|{any:FlowCondition[]};',
    FlowForm: 'interface FlowForm{id:string;title:string;description?:string;fields:FlowField[];}',
    BaseScreen: 'interface BaseScreen{id:string;when?:FlowCondition;}',
    MessageScreen:
      "interface MessageScreen extends BaseScreen{type:'message';title:string;description?:string;continueLabel?:string;}",
    FormScreen:
      "interface FormScreen extends BaseScreen{type:'form';form:string;continueLabel?:string;backLabel?:string;}",
    ScreenshotScreen:
      "interface ScreenshotScreen extends BaseScreen{type:'screenshot';title?:string;description?:string;mode:'optional'|'auto'|'required';continueLabel?:string;backLabel?:string;}",
    FlowScreen: 'type FlowScreen = MessageScreen|FormScreen|ScreenshotScreen;',
    FlowScreenTransitionFrame:
      'interface FlowScreenTransitionFrame{opacity?:number;translateX?:number;translateY?:number;scale?:number;}',
    FlowScreenTransitionMotion:
      'interface FlowScreenTransitionMotion{enterFrom:FlowScreenTransitionFrame;exitTo:FlowScreenTransitionFrame;}',
    FlowScreenTransition:
      "type FlowScreenTransition =|{kind:'none'}|{kind:'slide-horizontal'|'slide-vertical'|'fade'|'scale-fade';durationMs?:number;}|{kind:'custom';durationMs?:number;easing?:'standard'|'linear'|'ease-in'|'ease-out'|'ease-in-out';forward:FlowScreenTransitionMotion;backward:FlowScreenTransitionMotion;};",
    FlowIssueSection:
      "type FlowIssueSection =|{heading:string;answer:string;format?:'text'|'quote'|'stars'|'choice'|'code';omitWhenEmpty?:boolean;}|{heading:string;context:string;format?:'text'|'code';omitWhenEmpty?:boolean;};",
    FlowConfig:
      "interface FlowConfig{configVersion:1;id:string;presentation:{kind:'modal';size?:'compact'|'default'|'wide';columns?:1|2;screenTransition?:FlowScreenTransition;};appearance?:{theme?:VariantTheme;accentColor?:string;density?:'compact'|'comfortable';};content?:{successTitle?:string;successMessage?:string;cancelLabel?:string;};forms:FlowForm[];screens:FlowScreen[];issue:{classification?:'bug'|'feature'|'question';title:string;sections?:FlowIssueSection[];};evidence?:{attachments?:string;sendConsoleLogs?:string;submitter?:{name?:string;email?:string};};}",
    FlowOpenOptions:
      'interface FlowOpenOptions{context?:VariantContext;initialAnswers?:Record<string,unknown>;}',
    FlowOutcome:
      "type FlowOutcome ={status:'submitted';result:SubmissionResult}|{status:'closed'}|{status:'busy'};",
    OpenedFlow:
      'interface OpenedFlow{readonly instanceId:string;readonly result:Promise<FlowOutcome>;close():void;}',
    FlowHandle:
      'interface FlowHandle{readonly id:string;open(options?:FlowOpenOptions):OpenedFlow;}',
    VariantTheme: "type VariantTheme = 'light'|'dark'|'auto';",
    VariantContextValue: 'type VariantContextValue = string|number|boolean|null;',
    VariantContext: 'type VariantContext = Record<string,VariantContextValue>;',
    BaseField:
      'interface BaseField{id:string;label:string;helpText?:string;required?:boolean;layout?:{span?:1|2};}',
    ShortTextField:
      "interface ShortTextField extends BaseField{type:'shortText';placeholder?:string;minLength?:number;maxLength?:number;}",
    LongTextField:
      "interface LongTextField extends BaseField{type:'longText';placeholder?:string;rows?:number;minLength?:number;maxLength?:number;}",
    RatingField:
      "interface RatingField extends BaseField{type:'rating';scale?:5|10;icon?:'star'|'number';lowLabel?:string;highLabel?:string;}",
    SingleChoiceField:
      "interface SingleChoiceField extends BaseField{type:'singleChoice';options:Array<{value:string;label:string;description?:string}>;display?:'radio'|'cards'|'buttons';}",
    VariantField: 'type VariantField = ShortTextField|LongTextField|RatingField|SingleChoiceField;',
    SubmissionResult:
      'interface SubmissionResult{issueNumber:number;issueUrl:string;isPublic:boolean;labelMappingWarnings?:string[];}',
    'BugDropPublicAPI.registerFlow':
      "registerFlow(config:import('../flows/public-types').FlowConfig):import('../flows/public-types').FlowHandle;",
  },
  registration: {
    method: 'registerFlow',
    parameter: 'config',
    parameterType: 'FlowConfig',
    parameterRequired: true,
    returnType: 'FlowHandle',
  },
  configVersion: [1],
  configProperties: {
    required: ['configVersion', 'id', 'presentation', 'forms', 'screens', 'issue'],
    optional: ['appearance', 'content', 'evidence'],
  },
  validation: {
    forms: { minimum: 1, maximum: 12 },
    screens: { minimum: 1, maximum: 20 },
    fieldsPerForm: { minimum: 1, maximum: 20 },
    screenshotScreens: { maximum: 1 },
    conditionGroupEntries: { minimum: 1, maximum: 8 },
    conditionDepth: { maximum: 4 },
    conditionNodes: { maximum: 32 },
    issueSections: { maximum: 20 },
    structuralRules: [
      'every form must be referenced by exactly one form screen',
      'at least one screen must be unconditional',
      'answer conditions may reference only fields from earlier form screens',
      'a placeholder-only Issue title must reference an unconditional required answer',
    ],
  },
  fields: {
    types: Object.keys(FIELD_CONTRACTS),
    byType: FIELD_CONTRACTS,
    optionShape: { required: ['value', 'label'], optional: ['description'] },
    layoutProperties: { required: [], optional: ['span'] },
    layoutSpans: [1, 2],
    ratingScales: [5, 10],
    ratingIcons: ['star', 'number'],
    singleChoiceDisplays: ['radio', 'cards', 'buttons'],
    constraints: {
      text: {
        minLength: { minimum: 0, maximum: 5_000, default: 0 },
        maxLength: { minimum: 1, maximum: 5_000, defaults: { shortText: 500, longText: 5_000 } },
        longTextRows: { minimum: 1, maximum: 50 },
      },
      singleChoiceOptions: { minimum: 2, maximum: 50 },
      attachments: {
        maxFiles: { minimum: 1, maximum: 5, default: 5 },
        maxFileSizeBytes: { minimum: 1, maximum: 5_242_880, default: 5_242_880 },
        acceptCount: { minimum: 1, maximum: 20 },
        acceptedMimeTypes: [
          'image/png', 'image/jpeg', 'image/gif', 'image/webp',
          'application/pdf', 'video/mp4', 'video/webm', 'video/quicktime',
        ],
      },
    },
  },
  forms: {
    properties: { required: ['id', 'title', 'fields'], optional: ['description'] },
  },
  screens: {
    types: Object.keys(SCREEN_CONTRACTS),
    byType: SCREEN_CONTRACTS,
    screenshotModes: ['optional', 'auto', 'required'],
  },
  conditions: {
    branches: {
      answer: { required: ['answer', 'equals'], optional: [] },
      context: { required: ['context', 'equals'], optional: [] },
      all: { required: ['all'], optional: [] },
      any: { required: ['any'], optional: [] },
    },
    scalarTypes: ['string', 'number', 'boolean', 'null'],
    contextValueTypes: ['string', 'number', 'boolean', 'null'],
    recursiveBranches: ['all', 'any'],
  },
  presentation: {
    properties: {
      required: ['kind'],
      optional: ['size', 'columns', 'screenTransition'],
    },
    kinds: ['modal'],
    sizes: ['compact', 'default', 'wide'],
    columns: [1, 2],
  },
  appearance: {
    properties: { required: [], optional: ['theme', 'accentColor', 'density'] },
    themes: ['light', 'dark', 'auto'],
    densities: ['compact', 'comfortable'],
  },
  content: {
    properties: { required: [], optional: ['successTitle', 'successMessage', 'cancelLabel'] },
  },
  transitions: {
    kinds: TRANSITION_KINDS,
    builtInKinds: TRANSITION_KINDS.filter(kind => kind !== 'none' && kind !== 'custom'),
    branches: {
      none: { required: ['kind'], optional: [] },
      builtIn: { required: ['kind'], optional: ['durationMs'] },
      custom: {
        required: ['kind', 'forward', 'backward'],
        optional: ['durationMs', 'easing'],
      },
    },
    easings: ['standard', 'linear', 'ease-in', 'ease-out', 'ease-in-out'],
    customEasingDefault: 'standard',
    motionProperties: { required: ['enterFrom', 'exitTo'], optional: [] },
    frameProperties: {
      required: [],
      optional: ['opacity', 'translateX', 'translateY', 'scale'],
    },
    durationMs: { minimum: 100, maximum: 1_000, integer: true },
    defaultDurationMs: {
      'slide-horizontal': 500,
      'slide-vertical': 500,
      fade: 350,
      'scale-fade': 450,
      custom: 500,
    },
    frameBounds: {
      opacity: { minimum: 0, maximum: 1 },
      translateX: { minimum: -200, maximum: 200 },
      translateY: { minimum: -200, maximum: 200 },
      scale: { minimum: 0.5, maximum: 1.5 },
    },
    frameDefaults: { opacity: 1, translateX: 0, translateY: 0, scale: 1 },
    directions: ['forward', 'backward'],
    directionBehavior:
      'configured motion and built-in slide classes follow the navigation direction',
    immediateWhen: ['transition omitted', 'kind none', 'initial screen', 'reduced motion'],
  },
  issue: {
    properties: {
      required: ['title'],
      optional: ['classification', 'sections'],
    },
    classifications: ['bug', 'feature', 'question'],
    sections: {
      answer: {
        properties: {
          required: ['heading', 'answer'],
          optional: ['format', 'omitWhenEmpty'],
        },
        formats: ['text', 'quote', 'stars', 'choice', 'code'],
      },
      context: {
        properties: {
          required: ['heading', 'context'],
          optional: ['format', 'omitWhenEmpty'],
        },
        formats: ['text', 'code'],
      },
    },
  },
  evidence: {
    properties: {
      required: [],
      optional: ['attachments', 'sendConsoleLogs', 'submitter'],
    },
    submitterProperties: { required: [], optional: ['name', 'email'] },
  },
  lifecycle: {
    handleProperties: { required: ['id', 'open'], optional: [] },
    openMethod: {
      parameter: 'options',
      parameterType: 'FlowOpenOptions',
      parameterRequired: false,
      returnType: 'OpenedFlow',
    },
    openOptionProperties: { required: [], optional: ['context', 'initialAnswers'] },
    openedProperties: { required: ['instanceId', 'result', 'close'], optional: [] },
    closeMethod: { parameterCount: 0, returnType: 'void' },
    outcomeBranches: {
      submitted: { required: ['status', 'result'], optional: [] },
      closed: { required: ['status'], optional: [] },
      busy: { required: ['status'], optional: [] },
    },
    submissionResultProperties: {
      required: ['issueNumber', 'issueUrl', 'isPublic'],
      optional: ['labelMappingWarnings'],
    },
  },
  exclusions: {
    variantOnly: [
      'presentation.kind=inline',
      'issue.classification=feedback',
      'VariantHandle.mount',
      'VariantHandle.submit',
      'VariantContent requirement',
    ],
    unreleased: ['field.type=multiSelect'],
  },
} as const;

export type FlowCapabilities = typeof FLOW_CAPABILITIES;
