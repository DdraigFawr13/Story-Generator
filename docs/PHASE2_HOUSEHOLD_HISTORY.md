# I.4 — Household history and chronicle filters

This increment exposes factual household history and filters the complete retained chronicle. It uses existing `p2-settlement-v1` identities and records; passive reading consumes no RNG and changes no simulation, save schema or historical record. Original P1 v1/v2 worlds keep their own rules and receive category/importance filters without retroactive named people.

## Household evidence

Choose a household from the resident reader or follow a resident's household link. The profile shows actual living and deceased members, ages at death, known parent links, primary home, unhoused count and huts occupied by its living members. Naturally retired households remain selectable. Member and household navigation provides a return trail; hut controls focus the real map location and inspect its original creation record.

Shared household names, membership and co-residence do not establish spouses, siblings or guardians. Founders' earlier parentage remains unknown. Current P2 records supply one known parent for a born child; the reader states that further parentage is unknown. Homes may be shared by multiple households.

The pure `householdDossier` projection retains founding, birth, death, home and work records. Grouped home/work summaries include only the selected household's actual participant rows and link to the complete original source. Death ages use the actual death tick. Deterministic `household-historian-v1` paragraphs describe recorded entry and the latest recorded birth/death, with direct evidence links and no invented earlier life.

Members, current homes and household records render at most 32 per page; every retained member/home/record remains reachable. Evidence and causal inspection return to the exact clicked source with its reading scroll and keyboard focus. Accepted world replacement clears inspection and filters even for the same seed/week; rejected Resume preserves the current view.

## Chronicle filters

The collapsed **Filter records** controls combine actual person, household, record category and existing canonical importance with AND semantics. Person matching uses the record's real actor/entity IDs. Household matching uses its own ID or the IDs of its recorded members, including deceased members. Unknown person/household IDs match nothing; building IDs cannot masquerade as residents. Membership is stable in the current P2 version; a future membership-changing version must define historical filtering before reusing this contract.

The list selects from the complete archive, renders up to 200 matches and offers earlier/newer matching pages. Changing or clearing filters resets pagination. Direct record lookup and cause links can inspect any retained source, including one outside the current filters; the evidence pane states when this occurs. Filters and paging do not edit the source archive or the canonical importance of a record.

## Verification and inspected examples

Seven targeted unit cases pass: original-version/unknown-household rejection, founding kinship limits, naturally retired membership and real births/deaths, grouped participant projection, combined older-archive filters and importance, invalid subject IDs, and complete world/RNG/archive immutability.

The full local browser regression passed **225 cases**, 75 each in Chromium, Firefox and WebKit (14.2 minutes), without failures or retries. Nine new cases per engine cover household/member navigation, actual known parentage and retirement, source/cause focus and scroll, combined filters beyond the latest 200 headlines, complete archive pagination, accepted/rejected replacement and 320×568 / 390×650 phones at 200% text. Existing resident, recap, both P1 save versions, persistence and Node/browser parity checks also pass. Formatting, strict types, 50-module boundaries and the production build pass. Final-head full GitHub CI and exact-main production verification are required at merge and recorded in the milestone PR.

The rendered local sample is the actual **LIVES_4 world at week 1,000**: 36 retained people, 24 living, five active households and the naturally retired Grove household #13. Grove keeps its four deceased founders, no assigned current hut and 57 household records. Its latest death is Bera Grove, linked to record #602 at Year 17 · spring · week 12. Willow household #16 shows actual born members and their recorded parents. Its birth filter includes earlier records outside the newest 200 world headlines. This is an evidence sample, not multi-seed century or human experience acceptance.

Inspected screenshots:

- [Retired household and deceased membership](evidence/phase2-retired-household.png)
- [Household annals and retained source records](evidence/phase2-household-annals.png)
- [Combined household/birth chronicle filter](evidence/phase2-household-filter.png)
- [390×650 phone: real parent links and map context](evidence/phase2-household-phone.png)
- [320×568 phone at 200% text: visible close control and wrapped heading](evidence/phase2-household-phone-text.png)

## Remaining scope

Permanent professions, partnerships, guardianship/inheritance, sickness, social memory and autonomous social decisions remain later versioned increments. Q-005's Spotlight opportunity families, budgets and commands remain unresolved. No hosted service or observer nudge is introduced. Selected art, physical-device review and human experience acceptance remain open.
