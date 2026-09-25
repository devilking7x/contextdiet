import claudeMd from "./samples/CLAUDE.md?raw";
import reviewerSkill from "./samples/skills/reviewer/SKILL.md?raw";
import deployerSkill from "./samples/skills/deployer/SKILL.md?raw";
import mcpJson from "./samples/.mcp.json?raw";

export interface SampleFile {
  name: string;
  text: string;
}

export const SAMPLE_FILES: SampleFile[] = [
  { name: "CLAUDE.md", text: claudeMd },
  { name: "skills/reviewer/SKILL.md", text: reviewerSkill },
  { name: "skills/deployer/SKILL.md", text: deployerSkill },
  { name: ".mcp.json", text: mcpJson },
];
