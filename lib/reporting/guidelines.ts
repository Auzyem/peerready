export type ReportingGuidelineId =
  | 'consort_2010' | 'prisma_2020' | 'arrive_2' | 'strobe' | 'generic'

export interface ReportingGuidelineItem {
  code: string        // e.g. "1", "13"
  section: string     // e.g. "Title and abstract"
  requirement: string // the checklist item text
}

export interface ReportingGuideline {
  id: ReportingGuidelineId
  name: string
  version: string
  url: string
  applicableTo: string
  items: ReportingGuidelineItem[]
}

const GENERIC: ReportingGuideline = {
  id: 'generic',
  name: 'Reporting essentials',
  version: '1.0',
  url: '',
  applicableTo: 'Any manuscript with no study-type-specific reporting guideline',
  items: [
    { code: '1', section: 'Title and abstract', requirement: 'A structured abstract that states background, methods, results, and conclusions, and a title that identifies the study type.' },
    { code: '2', section: 'Title and abstract', requirement: 'Keywords appropriate for indexing and discovery.' },
    { code: '3', section: 'Funding', requirement: 'A funding statement naming sources of support (or stating that none were received).' },
    { code: '4', section: 'Ethics', requirement: 'A statement of ethics / institutional review board (IRB) approval, or an explanation of why approval was not required.' },
    { code: '5', section: 'Ethics', requirement: 'A statement that informed consent was obtained from participants where applicable.' },
    { code: '6', section: 'Declarations', requirement: 'A conflict-of-interest / competing-interests declaration for all authors.' },
    { code: '7', section: 'Declarations', requirement: 'A data-availability statement describing where the underlying data can be accessed.' },
    { code: '8', section: 'Declarations', requirement: 'An author-contributions statement describing each author\'s role.' },
  ],
}

// Source: CONSORT 2010 Statement — Schulz KF, Altman DG, Moher D (2010).
// Originally at https://www.consort-statement.org/ (now https://www.consort-spirit.org/)
// 25 top-level items; sub-items (a/b) merged into requirement text.
const CONSORT: ReportingGuideline = {
  id: 'consort_2010',
  name: 'CONSORT 2010',
  version: '2010',
  url: 'https://www.consort-statement.org/checklists/view/32-consort-2010/66-title',
  applicableTo: 'Randomized controlled trials',
  items: [
    {
      code: '1',
      section: 'Title and abstract',
      requirement: 'Identification as a randomised trial in the title. Structured summary of trial design, methods, results, and conclusions (for specific guidance see CONSORT for abstracts).',
    },
    {
      code: '2',
      section: 'Introduction',
      requirement: 'Scientific background and explanation of rationale.',
    },
    {
      code: '3',
      section: 'Introduction',
      requirement: 'Specific objectives or hypotheses.',
    },
    {
      code: '4',
      section: 'Methods',
      requirement: 'Description of trial design (such as parallel, factorial) including allocation ratio, and any important changes to methods after trial commencement (such as eligibility criteria), with reasons.',
    },
    {
      code: '5',
      section: 'Methods',
      requirement: 'Eligibility criteria for participants. Settings and locations where the data were collected.',
    },
    {
      code: '6',
      section: 'Methods',
      requirement: 'The interventions for each group with sufficient details to allow replication, including how and when they were actually administered.',
    },
    {
      code: '7',
      section: 'Methods',
      requirement: 'Completely defined pre-specified primary and secondary outcome measures, including how and when they were assessed. Any changes to trial outcomes after the trial commenced, with reasons.',
    },
    {
      code: '8',
      section: 'Methods',
      requirement: 'How sample size was determined. When applicable, explanation of any interim analyses and stopping guidelines.',
    },
    {
      code: '9',
      section: 'Methods',
      requirement: 'Method used to generate the random allocation sequence. Type of randomisation; details of any restriction (such as blocking and block sizes).',
    },
    {
      code: '10',
      section: 'Methods',
      requirement: 'Mechanism used to implement the random allocation sequence (such as sequentially numbered containers), describing any steps taken to conceal the sequence until interventions were assigned.',
    },
    {
      code: '11',
      section: 'Methods',
      requirement: 'Who generated the random allocation sequence, who enrolled participants, and who assigned participants to interventions.',
    },
    {
      code: '12',
      section: 'Methods',
      requirement: 'If done, who was blinded after assignment to interventions (for example, participants, care providers, those assessing outcomes) and how. If relevant, description of the similarity of interventions.',
    },
    {
      code: '13',
      section: 'Methods',
      requirement: 'Statistical methods used to compare groups for primary and secondary outcomes. Methods for additional analyses, such as subgroup analyses and adjusted analyses.',
    },
    {
      code: '14',
      section: 'Results',
      requirement: 'For each group, the numbers of participants who were randomly assigned, received intended treatment, and were analysed for the primary outcome. For each group, losses and exclusions after randomisation, together with reasons.',
    },
    {
      code: '15',
      section: 'Results',
      requirement: 'Dates defining the periods of recruitment and follow-up. Why the trial ended or was stopped.',
    },
    {
      code: '16',
      section: 'Results',
      requirement: 'A table showing baseline demographic and clinical characteristics for each group.',
    },
    {
      code: '17',
      section: 'Results',
      requirement: 'For each group, number of participants (denominator) included in each analysis and whether the analysis was by original assigned groups. For binary outcomes, presentation of both absolute and relative effect sizes is recommended.',
    },
    {
      code: '18',
      section: 'Results',
      requirement: 'For each primary and secondary outcome, results for each group, and the estimated effect size and its precision (such as 95% confidence interval).',
    },
    {
      code: '19',
      section: 'Results',
      requirement: 'Results of any other analyses performed, including subgroup analyses and adjusted analyses, distinguishing pre-specified from exploratory.',
    },
    {
      code: '20',
      section: 'Results',
      requirement: 'All important harms or unintended effects in each group (for specific guidance see CONSORT for harms).',
    },
    {
      code: '21',
      section: 'Discussion',
      requirement: 'Trial limitations, addressing sources of potential bias, imprecision, and, if relevant, multiplicity of analyses.',
    },
    {
      code: '22',
      section: 'Discussion',
      requirement: 'Generalisability (external validity, applicability) of the trial findings.',
    },
    {
      code: '23',
      section: 'Discussion',
      requirement: 'Interpretation consistent with results, balancing benefits and harms, and considering other relevant evidence.',
    },
    {
      code: '24',
      section: 'Other information',
      requirement: 'Registration number and name of trial registry.',
    },
    {
      code: '25',
      section: 'Other information',
      requirement: 'Where the full trial protocol can be accessed, if available.',
    },
  ],
}

// Source: PRISMA 2020 Statement — Page MJ, et al. (2021). BMJ 2021;372:n71.
// Fetched from https://prisma.shinyapps.io/checklist/
// 27 top-level items; sub-items merged into requirement text.
const PRISMA: ReportingGuideline = {
  id: 'prisma_2020',
  name: 'PRISMA 2020',
  version: '2020',
  url: 'https://www.prisma-statement.org/prisma-2020-checklist',
  applicableTo: 'Systematic reviews and meta-analyses',
  items: [
    {
      code: '1',
      section: 'Title',
      requirement: 'Identify the report as a systematic review.',
    },
    {
      code: '2',
      section: 'Abstract',
      requirement: 'See the PRISMA 2020 for Abstracts checklist. Provide a structured summary including, as applicable: background; objectives; data sources; study eligibility criteria, participants, and interventions; study appraisal and synthesis methods; results; limitations; conclusions and implications of key findings; systematic review registration number.',
    },
    {
      code: '3',
      section: 'Introduction',
      requirement: 'Describe the rationale for the review in the context of existing knowledge.',
    },
    {
      code: '4',
      section: 'Introduction',
      requirement: 'Provide an explicit statement of the objective(s) or question(s) the review addresses.',
    },
    {
      code: '5',
      section: 'Methods',
      requirement: 'Specify the inclusion and exclusion criteria for the review and how studies were grouped for syntheses.',
    },
    {
      code: '6',
      section: 'Methods',
      requirement: 'Specify all databases, registers, websites, organisations, reference lists and other sources searched or consulted to identify studies. Specify the date when each source was last searched or consulted.',
    },
    {
      code: '7',
      section: 'Methods',
      requirement: 'Present the full search strategies for all databases, registers and websites, including any filters and limits used.',
    },
    {
      code: '8',
      section: 'Methods',
      requirement: 'Specify the methods used to decide whether a study met the inclusion criteria of the review, including how many reviewers screened each record and each report retrieved, whether they worked independently, and if applicable, details of automation tools used in the process.',
    },
    {
      code: '9',
      section: 'Methods',
      requirement: 'Specify the methods used to collect data from reports, including how many reviewers collected data from each report, whether they worked independently, any processes for obtaining or confirming data from study investigators, and if applicable, details of automation tools used in the process.',
    },
    {
      code: '10',
      section: 'Methods',
      requirement: 'List and define all outcomes for which data were sought. Specify whether all results that were compatible with each outcome domain in each study were sought (e.g. for all measures, time points, analyses), and if not, the methods used to decide which results to collect. List and define all other variables for which data were sought (e.g. participant and intervention characteristics, funding sources). Describe any assumptions made about any missing or unclear information.',
    },
    {
      code: '11',
      section: 'Methods',
      requirement: 'Specify the methods used to assess risk of bias in the included studies, including details of the tool(s) used, how many reviewers assessed each study and whether they worked independently, and if applicable, details of automation tools used in the process.',
    },
    {
      code: '12',
      section: 'Methods',
      requirement: 'Specify for each outcome the effect measure(s) (e.g. risk ratio, mean difference) used in the synthesis or presentation of results.',
    },
    {
      code: '13',
      section: 'Methods',
      requirement: 'Describe the processes used to decide which studies were eligible for each synthesis (e.g. tabulating the study intervention characteristics and comparing against the planned groups for each synthesis). Describe any methods required to prepare the data for presentation or synthesis, such as handling of missing summary statistics, or data conversions. Describe any methods used to tabulate or visually display results of individual studies and syntheses. Describe any methods used to synthesize results and provide a rationale for the choice(s). If meta-analysis was performed, describe the model(s), method(s) to identify the presence and extent of statistical heterogeneity, and software package(s) used. Describe any methods used to explore possible causes of heterogeneity among study results (e.g. subgroup analysis, meta-regression). Describe any sensitivity analyses conducted to assess robustness of the synthesized results.',
    },
    {
      code: '14',
      section: 'Methods',
      requirement: 'Describe any methods used to assess risk of bias due to missing results in a synthesis (arising from reporting biases).',
    },
    {
      code: '15',
      section: 'Methods',
      requirement: 'Describe any methods used to assess certainty (or confidence) in the body of evidence for an outcome.',
    },
    {
      code: '16',
      section: 'Results',
      requirement: 'Describe the results of the search and selection process, from the number of records identified in the search to the number of studies included in the review, ideally using a flow diagram. Cite studies that might appear to meet the inclusion criteria, but which were excluded, and explain why they were excluded.',
    },
    {
      code: '17',
      section: 'Results',
      requirement: 'Cite each included study and present its characteristics.',
    },
    {
      code: '18',
      section: 'Results',
      requirement: 'Present assessments of risk of bias for each included study.',
    },
    {
      code: '19',
      section: 'Results',
      requirement: 'For all outcomes, present, for each study: (a) summary statistics for each group (where appropriate) and (b) an effect estimate and its precision (e.g. confidence/credible interval), ideally using structured tables or plots.',
    },
    {
      code: '20',
      section: 'Results',
      requirement: 'For each synthesis, briefly summarise the characteristics and risk of bias among contributing studies. Present results of all statistical syntheses conducted. If meta-analysis was done, present for each the summary estimate and its precision (e.g. confidence/credible interval) and measures of statistical heterogeneity. If comparing groups, describe the direction of the effect. Present results of all investigations of possible causes of heterogeneity among study results. Present results of all sensitivity analyses conducted to assess the robustness of the synthesized results.',
    },
    {
      code: '21',
      section: 'Results',
      requirement: 'Present assessments of risk of bias due to missing results (arising from reporting biases) for each synthesis assessed.',
    },
    {
      code: '22',
      section: 'Results',
      requirement: 'Present assessments of certainty (or confidence) in the body of evidence for each outcome assessed.',
    },
    {
      code: '23',
      section: 'Discussion',
      requirement: 'Provide a general interpretation of the results in the context of other evidence. Discuss any limitations of the evidence included in the review. Discuss any limitations of the review processes used. Discuss implications of the results for practice, policy, and future research.',
    },
    {
      code: '24',
      section: 'Other information',
      requirement: 'Provide registration information for the review, including register name and registration number, or state that the review was not registered. Indicate where the review protocol can be accessed, or state that a protocol was not prepared. Describe and explain any amendments to information provided at registration or in the protocol.',
    },
    {
      code: '25',
      section: 'Other information',
      requirement: 'Describe sources of financial or non-financial support for the review, and the role of the funders or sponsors in the review.',
    },
    {
      code: '26',
      section: 'Other information',
      requirement: 'Declare any competing interests of review authors.',
    },
    {
      code: '27',
      section: 'Other information',
      requirement: 'Report which of the following are publicly available and where they can be found: template data collection forms; data extracted from included studies; data used for all analyses; analytic code; any other materials used in the review.',
    },
  ],
}

// Source: ARRIVE 2.0 Guidelines — Percie du Sert N, et al. (2020). PLOS Biology.
// Essential 10 items fetched from https://arriveguidelines.org/arrive-guidelines
// One item per Essential 10 category; requirement text drawn from official sub-item text.
const ARRIVE: ReportingGuideline = {
  id: 'arrive_2',
  name: 'ARRIVE 2.0 (Essential 10)',
  version: '2.0',
  url: 'https://arriveguidelines.org/arrive-guidelines',
  applicableTo: 'In vivo animal research',
  items: [
    {
      code: '1',
      section: 'Study design',
      requirement: 'For each experiment, provide brief details of study design including: the groups being compared, including control groups. If no control group has been used, the rationale should be stated.',
    },
    {
      code: '2',
      section: 'Sample size',
      requirement: 'Specify the exact number of experimental units allocated to each group, and the total number in each experiment. Also indicate the total number of animals used.',
    },
    {
      code: '3',
      section: 'Inclusion and exclusion criteria',
      requirement: 'Describe any criteria used for including and excluding animals (or experimental units) during the experiment, and data points during the analysis. Specify if these criteria were established a priori. If no criteria were set, state this explicitly. For each experimental group, report the number of animals (or experimental units) excluded from the analysis and the reasons.',
    },
    {
      code: '4',
      section: 'Randomisation',
      requirement: 'State whether randomisation was used to allocate experimental units to control and treatment groups. If done, provide the method used to generate the randomisation sequence and the unit of randomisation (e.g. animal, litter, cage). If randomisation was not used, explain why.',
    },
    {
      code: '5',
      section: 'Blinding',
      requirement: 'Describe who was aware of the group allocation at the different stages of the experiment (during the allocation, the conduct of the experiment, the outcome assessment, and the data analysis). If blinding was not possible, state this explicitly and explain the measures taken to minimise the risk of bias.',
    },
    {
      code: '6',
      section: 'Outcome measures',
      requirement: 'Clearly define all outcome measures assessed (e.g. cell death, molecular markers, or behavioural changes). For hypothesis-testing studies, specify the primary outcome measure, i.e. the outcome measure that was used to determine the sample size.',
    },
    {
      code: '7',
      section: 'Statistical methods',
      requirement: 'Provide details of the statistical methods used for each analysis, including software used. Describe the statistical methods used and whether they appropriately reflect the experimental design and the hierarchy of the data (e.g. reporting the analysis on the correct experimental unit).',
    },
    {
      code: '8',
      section: 'Experimental animals',
      requirement: 'Provide species-appropriate details of the animals used, including species, strain and substrain, sex, age or developmental stage and, if relevant, weight. Provide details of the source of animals, the housing and husbandry conditions, and any acclimatisation period.',
    },
    {
      code: '9',
      section: 'Experimental procedures',
      requirement: 'For each experimental group, including controls, describe the procedures in enough detail to allow others to replicate them, including what was done, how it was done, what was used, when and how often procedures were carried out, where the procedures were performed, and why the procedures were performed.',
    },
    {
      code: '10',
      section: 'Results',
      requirement: 'Report the results for all outcome measures assessed, not only those with statistically significant or notable results. For each experiment conducted, provide summary/descriptive statistics for each experimental group, with a measure of variability where applicable (e.g. mean and SD, or median and range). Provide the exact number of experimental units per group.',
    },
  ],
}

// Source: STROBE Statement — von Elm E, Altman DG, Egger M, et al. (2007).
// Published in PLoS Med, Ann Intern Med, Lancet, BMJ, and others.
// 22 top-level items (combined checklist); sub-items (a/b/c) merged into requirement text.
// Sections: Title and abstract (1), Introduction (2–3), Methods (4–12),
// Results (13–17), Discussion (18–21), Other information (22).
const STROBE: ReportingGuideline = {
  id: 'strobe',
  name: 'STROBE',
  version: '2007',
  url: 'https://www.strobe-statement.org/checklists/',
  applicableTo: 'Observational studies (cohort, case-control, cross-sectional)',
  items: [
    {
      code: '1',
      section: 'Title and abstract',
      requirement: 'Indicate the study\'s design with a commonly used term in the title or the abstract. Provide in the abstract an informative and balanced summary of what was done and what was found.',
    },
    {
      code: '2',
      section: 'Introduction',
      requirement: 'Explain the scientific background and rationale for the investigation being reported.',
    },
    {
      code: '3',
      section: 'Introduction',
      requirement: 'State specific objectives, including any prespecified hypotheses.',
    },
    {
      code: '4',
      section: 'Methods',
      requirement: 'Present key elements of study design early in the paper.',
    },
    {
      code: '5',
      section: 'Methods',
      requirement: 'Describe the setting, locations, and relevant dates, including periods of recruitment, exposure, follow-up, and data collection.',
    },
    {
      code: '6',
      section: 'Methods',
      requirement: 'Give the eligibility criteria, and the sources and methods of selection of participants. For cohort studies, describe the sources of exposure data and methods of follow-up. For case-control studies, describe the rationale for the choice of cases and controls, and sources and methods of case ascertainment and control selection. For cross-sectional studies, describe the source of data and methods of assessment of exposure.',
    },
    {
      code: '7',
      section: 'Methods',
      requirement: 'For matched studies, give matching criteria and the number of controls per case.',
    },
    {
      code: '8',
      section: 'Methods',
      requirement: 'Clearly define all outcomes, exposures, predictors, potential confounders, and effect modifiers. Give diagnostic criteria, if applicable.',
    },
    {
      code: '9',
      section: 'Methods',
      requirement: 'Describe any efforts to address potential sources of bias.',
    },
    {
      code: '10',
      section: 'Methods',
      requirement: 'Explain how the study size was arrived at.',
    },
    {
      code: '11',
      section: 'Methods',
      requirement: 'Explain how quantitative variables were handled in the analyses. If applicable, describe which groupings were chosen and why.',
    },
    {
      code: '12',
      section: 'Methods',
      requirement: 'Describe all statistical methods, including those used to control for confounding. Describe any methods used to examine subgroups and interactions. Explain how missing data were addressed. For cohort studies, describe how loss to follow-up was addressed. For case-control studies, if applicable, explain how matching of cases and controls was addressed. For cross-sectional studies, if applicable, describe analytical methods taking account of sampling strategy. Describe any sensitivity analyses.',
    },
    {
      code: '13',
      section: 'Results',
      requirement: 'Report the numbers of individuals at each stage of the study—e.g. numbers potentially eligible, examined for eligibility, confirmed eligible, included in the study, completing follow-up, and analysed. Give reasons for non-participation at each stage. Consider use of a flow diagram.',
    },
    {
      code: '14',
      section: 'Results',
      requirement: 'Give characteristics of study participants (e.g. demographic, clinical, social) and information on exposures and potential confounders. Indicate the number of participants with missing data for each variable of interest. For cohort studies, summarise follow-up time (e.g., average and total amount).',
    },
    {
      code: '15',
      section: 'Results',
      requirement: 'For cohort studies, report numbers of outcome events or summary measures over time. For case-control studies, report numbers in each exposure category, or summary measures of exposure. For cross-sectional studies, report numbers of outcome events or summary measures.',
    },
    {
      code: '16',
      section: 'Results',
      requirement: 'Report unadjusted estimates and, if applicable, confounder-adjusted estimates and their precision (e.g., 95% confidence interval). Make clear which confounders were adjusted for and why they were included.',
    },
    {
      code: '17',
      section: 'Results',
      requirement: 'Report other analyses done—e.g. analyses of subgroups and interactions, and sensitivity analyses.',
    },
    {
      code: '18',
      section: 'Discussion',
      requirement: 'Summarise key results with reference to study objectives.',
    },
    {
      code: '19',
      section: 'Discussion',
      requirement: 'Discuss limitations of the study, taking into account sources of potential bias or imprecision. Discuss both direction and magnitude of any potential bias.',
    },
    {
      code: '20',
      section: 'Discussion',
      requirement: 'Give a cautious overall interpretation of results considering objectives, limitations, multiplicity of analyses, results from similar studies, and other relevant evidence.',
    },
    {
      code: '21',
      section: 'Discussion',
      requirement: 'Discuss the generalisability (external validity) of the study results.',
    },
    {
      code: '22',
      section: 'Other information',
      requirement: 'Give the source of funding and the role of the funders for the present study and, if applicable, for the original study on which the present article is based.',
    },
  ],
}

export const GUIDELINES: Record<ReportingGuidelineId, ReportingGuideline> = {
  consort_2010: CONSORT,
  prisma_2020: PRISMA,
  arrive_2: ARRIVE,
  strobe: STROBE,
  generic: GENERIC,
}

export const GUIDELINE_IDS = Object.keys(GUIDELINES) as ReportingGuidelineId[]
