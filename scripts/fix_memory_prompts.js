const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'agent', 'memory', 'MemoryModelClient.ts');
let content = fs.readFileSync(filePath, 'utf8');

const importMarker = "import { MemoryModelConfig, DEFAULT_MEMORY_MODEL_CONFIG, MemoryType } from '../../types';";
const userPromptMarker = "const USER_PROMPT_SUFFIX = `";

const importIdx = content.indexOf(importMarker);
if (importIdx === -1) {
  console.error('import marker not found');
  process.exit(1);
}
const userPromptIdx = content.indexOf(userPromptMarker);
if (userPromptIdx === -1) {
  console.error('USER_PROMPT_SUFFIX not found');
  process.exit(1);
}

const before = content.slice(0, importIdx + importMarker.length);
const after = content.slice(userPromptIdx);

const newFileContent = `const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'agent', 'memory', 'MemoryModelClient.ts');
let content = fs.readFileSync(filePath, 'utf8');

const importMarker = "import { MemoryModelConfig, DEFAULT_MEMORY_MODEL_CONFIG, MemoryType } from '../../types';";
const userPromptMarker = "const USER_PROMPT_SUFFIX = `";

const importIdx = content.indexOf(importMarker);
if (importIdx === -1) {
  console.error('import marker not found');
  process.exit(1);
}
const userPromptIdx = content.indexOf(userPromptMarker);
if (userPromptIdx === -1) {
  console.error('USER_PROMPT_SUFFIX not found');
  process.exit(1);
}

const before = content.slice(0, importIdx + importMarker.length);
const after = content.slice(userPromptIdx);

const strictBody = `你是一个记忆抽取器。\n\n任务：从「单条用户消息」中严格抽取高置信度的记忆候选，仅输出严格的 JSON 数组，且该 JSON 必须完整位于 <<<MEMORY>>> 与 <<<END>>> 之间。\n\n格式与严格要求：\n1) 输入：系统会以 SOURCE: <用户原话> 的形式传入单条消息。\n2) 输出字段:"type" (identity|preference|constraint|fact), "span", "resolvedText"（可选，不超过 30 字，字面化归一化），"sourceText"（必须与传入的 SOURCE 完全相同），"confidence"（0.7 - 1.0；严格模式下推荐 >= 0.75）。\n3) "span" 必须是 SOURCE 文本的连续子串（证据锚点），不得改写或补充信息。\n4) 若无可提取记忆，请仅返回空数组 []。\n5) 禁止输出任何额外解释、分析或非 JSON 内容。\n6) 严格避免基于常识的推断或语义扩写；仅提取字面上可证的事实/偏好/身份/约束。\n\n正例（严格）：\nSOURCE: 我是 UI 设计师，已经做了三年。\n<<<MEMORY>>>\n[{"type":"identity","span":"我是 UI 设计师","resolvedText":"是 UI 设计师","sourceText":"我是 UI 设计师，已经做了三年。","confidence":0.95}]\n<<<END>>>\n\nSOURCE: 我不吃香菜。\n<<<MEMORY>>>\n[{"type":"preference","span":"我不吃香菜","resolvedText":"不吃香菜","sourceText":"我不吃香菜。","confidence":0.90}]\n<<<END>>>\n\nSOURCE: 我的生日是 1990-06-15。\n<<<MEMORY>>>\n[{"type":"fact","span":"1990-06-15","resolvedText":"出生于 1990 年 6 月 15 日","sourceText":"我的生日是 1990-06-15。","confidence":0.92}]\n<<<END>>>\n\nSOURCE: 我每周只能在周末接单。\n<<<MEMORY>>>\n[{"type":"constraint","span":"每周只能在周末接单","resolvedText":"每周只在周末接单","sourceText":"我每周只能在周末接单。","confidence":0.88}]\n<<<END>>>\n\n负例（严格，不应抽取）:\nSOURCE: 你觉得我应该去旅行吗？\n<<<MEMORY>>>\n[]\n<<<END>>>\n\nSOURCE: 你说得挺有道理的，我也这么觉得。\n<<<MEMORY>>>\n[]\n<<<END>>>\n\nSOURCE: 我可能想去理塘，但请不了假也买不起机票。\n<<<MEMORY>>>\n[]\n<<<END>>>\n\n说明：当用户表达疑问、请求、态度或不确定性时，严格模式应返回空数组，避免误将问句、建议或评论当成记忆。`;

const relaxedBody = `你是一个记忆抽取器。\n\n任务：从「单条用户消息」中提取可能的记忆候选，允许在不确定时也列出潜在事实，但务必在每个候选上给出 confidence（0.0 - 1.0）。\n\n规则（relaxed）:\n1) 输入：系统会以 SOURCE: <用户原话> 的形式传入单条消息。\n2) 输出字段:"type" (identity|preference|constraint|fact), "span", "resolvedText"（可选），"sourceText"（必须与传入的 SOURCE 一致），"confidence"（0.0 - 1.0）。\n3) 优先使用 SOURCE 的连续子串作为 span；若必须裁剪，请在 resolvedText 保持字面证据并在 confidence 中反映不确定性。\n4) relaxed 模式允许对含有“可能、想、会、打算”等的陈述进行提取，但应分配较低 confidence（例如 0.4 - 0.7）。\n5) 仍禁止输出非 JSON 的解释或对话内容。\n6) 若无候选，请仅返回 []。\n\n示例（relaxed，可接受但需标注置信度）:\nSOURCE: 我可能想去理塘，但请不了假也买不起机票。\n<<<MEMORY>>>\n[{"type":"fact","span":"想去理塘","resolvedText":"可能想去理塘旅游","sourceText":"我可能想去理塘，但请不了假也买不起机票。","confidence":0.55}]\n<<<END>>>\n\nSOURCE: 我最近在肝《艾尔登法环》，死了快两百次了。\n<<<MEMORY>>>\n[{"type":"fact","span":"最近在肝《艾尔登法环》","resolvedText":"正在玩《艾尔登法环》","sourceText":"我最近在肝《艾尔登法环》，死了快两百次了。","confidence":0.7}]\n<<<END>>>\n\nSOURCE: 我可能会周末去拜访父母。\n<<<MEMORY>>>\n[{"type":"fact","span":"可能会周末去拜访父母","resolvedText":"可能周末拜访父母","sourceText":"我可能会周末去拜访父母。","confidence":0.5}]\n<<<END>>>\n\n负例（relaxed 仍应避免）:\nSOURCE: 你觉得我该怎么办？\n<<<MEMORY>>>\n[]\n<<<END>>>\n\nSOURCE: 那个人真聪明。\n<<<MEMORY>>>\n[]\n<<<END>>>\n\n说明：relaxed 用于提升召回，但请用置信度区分确定性。避免对显然是问句、主观评述或对话回馈进行抽取。`;

const newPrompts = '\n\nconst MEMORY_EXTRACTION_PROMPT = `' + strictBody + '`;\n\nconst RELAXED_MEMORY_EXTRACTION_PROMPT = `' + relaxedBody + '`;\n';

const newContent = before + newPrompts + '\n' + after;
fs.writeFileSync(filePath, newContent, 'utf8');
console.log('MemoryModelClient.ts prompts region replaced successfully');


const newContent = before + newPrompts + '\n' + after;
fs.writeFileSync(filePath, newContent, 'utf8');
console.log('MemoryModelClient.ts prompts region replaced successfully');
`;}**Explanation**:创建一个脚本来修复文件顶部重复/残留的 prompt 定义，替换为干净的 strict/relaxed prompts。