import { GoogleGenAI, Type } from "@google/genai";
import { Note, ProactiveNudge } from "../types";
import { withTimeout } from "../lib/utils";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = "gemini-3.1-flash-lite-preview";
const PRO_MODEL = "gemini-3.1-flash-lite-preview";

// Phase 0: Market-Fit Validator (초기 뼈대 자동 생성)
export const generateInitialBlueprint = async (businessIdea: string) => {
  const prompt = `당신은 세계 최고의 비즈니스 아키텍트이자 AI 코파운더입니다.
사용자가 제시한 비즈니스 아이디어를 분석하여, MVP(최소 기능 제품) 런칭을 위한 최적의 시스템 구조(Domain, Module, Logic)를 설계하세요.

[비즈니스 아이디어]
${businessIdea}

[설계 규칙]
1. Domain: 비즈니스의 최상위 개념 (예: '사용자 계정 시스템', '커머스 결제 시스템')
2. Module: 도메인을 구성하는 기능적 그룹 (예: '소셜 로그인', '장바구니')
3. Logic: 사용자가 체감하는 실제 서비스 단위 (예: '중복 아이디 가입 방지')
4. **언어 및 직관성**: 모든 제목(title)과 요약(summary)은 **한국어**로 작성하며, 개발 지식이 없는 사람도 한눈에 이해할 수 있도록 **매우 직관적이고 쉬운 단어**를 사용하세요.
5. MVP 스코핑: 당장 첫 달에 필수적인 기능(Must-have)만 포함하세요. (Nice-to-have는 제외)
6. 각 노드는 title, summary, type('Domain', 'Module', 'Logic')을 가져야 합니다.
7. 계층 구조를 명확히 하기 위해, Domain 안에 Module 배열이 있고, Module 안에 Logic 배열이 있는 중첩된 JSON 구조로 반환하세요.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "domains": [
    {
      "title": "직관적인 한국어 도메인 제목",
      "summary": "한국어 도메인 요약",
      "modules": [
        {
          "title": "직관적인 한국어 모듈 제목",
          "summary": "한국어 모듈 요약",
          "logics": [
            {
              "title": "직관적인 한국어 로직 제목",
              "summary": "한국어 로직 요약"
            }
          ]
        }
      ]
    }
  ]
}`;

  const responsePromise = ai.models.generateContent({
    model: PRO_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          domains: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                summary: { type: Type.STRING },
                modules: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      summary: { type: Type.STRING },
                      logics: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            title: { type: Type.STRING },
                            summary: { type: Type.STRING }
                          },
                          required: ["title", "summary"]
                        }
                      }
                    },
                    required: ["title", "summary", "logics"]
                  }
                }
              },
              required: ["title", "summary", "modules"]
            }
          }
        },
        required: ["domains"]
      }
    }
  });

  const response = await withTimeout(responsePromise, 60000, { text: "{}" } as any);

  try {
    return JSON.parse(response.text || "{}");
  } catch (e) {
    console.error("Failed to generate blueprint", e);
    return { domains: [] };
  }
};

// Phase 1: 로직 단위 추출
export const extractLogicUnits = async (filePath: string, fileContent: string) => {
  const prompt = `다음 소스 코드 파일에서 '원자적 로직 단위'(함수, 클래스, 주요 블록 등)를 추출하세요.

[핵심 규칙: 단일 책임 원칙(SRP) 기반의 원자적 분리]
1. 단순히 함수나 클래스 단위로 1:1 추출하지 마세요.
2. 하나의 거대한 함수(예: completeOrder) 내부에 여러 개의 독립적인 비즈니스 로직(예: 1. 결제 승인, 2. 재고 차감, 3. 영수증 발송)이 혼재되어 있다면, 이를 반드시 개별적인 원자적 로직 단위로 쪼개어 여러 개로 추출하세요.
3. 각 추출된 단위는 오직 '단 하나의 핵심 기능'만 수행해야 합니다.
4. 식별자(title)는 원본 영문 식별자를 기본으로 하되, 하나의 함수를 여러 개로 쪼갠 경우 해당 역할을 명확히 알 수 있도록 접미사를 달아주세요. (예: completeOrder_approvePayment, completeOrder_deductInventory)

File Path: ${filePath}

Code:
\`\`\`
${fileContent}
\`\`\`
`;

  const responsePromise = ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "로직 단위의 이름 (함수명, 클래스명 등)" },
            priority: { type: Type.STRING, description: "우선순위: A, B, C, 또는 Done" }
          },
          required: ["title", "priority"]
        }
      }
    }
  });

  const response = await withTimeout(responsePromise, 45000, { text: "[]" });

  try {
    const result = JSON.parse(response.text || "[]");
    return Array.isArray(result) ? result : [];
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    return [];
  }
};

// Phase 2: AI 심층 분석
export const analyzeLogicUnit = async (title: string, codeSnippet: string) => {
  const prompt = `다음 소스 코드에서 '${title}' 로직 단위를 심층 분석하세요.
(주의: '${title}'이 특정 함수의 일부분(예: 함수명_세부기능)을 가리킨다면, 전체 함수가 아닌 해당 '세부 기능'에 대해서만 집중적으로 분석하세요.)
반드시 한국어로 작성해야 합니다.

가독성을 극대화하기 위해 다음 규칙을 엄격히 준수하세요:
1. 모든 항목은 마크다운(Markdown) 형식을 사용하세요.
2. 'flow'와 'components'는 반드시 마크다운 리스트(- 또는 1.) 형식을 사용하세요. 가독성을 위해 리스트 항목(1. 2. 3. 등) 사이에는 **반드시 빈 줄(Empty Line)을 하나씩 삽입**하세요. (Loose List 형태)
3. 'summary'와 'io'도 정보가 많을 경우 줄바꿈을 적극적으로 사용하세요.
4. 전문 용어는 가급적 그대로 사용하되, 설명은 친절하게 작성하세요.

다음 5가지 항목을 추출하세요:
1. title (기술적 제목): '핵심 기능 + 기술' (구현 중심) 형식으로 작성하되, 단일 책임 원칙에 따라 '가장 핵심적인 단 하나의 기능'만 명시하세요. 'A 및 B', 'A와 B'처럼 여러 기능을 나열하지 마세요. (예: 'ensurePathNode: 계층 경로 동기화', 'updateStock: 트랜잭션 기반 재고 처리')
2. summary (기술적 역할): 이 코드 조각의 기술적인 핵심 기능을 한 문장으로 정의하세요.
3. components (기술적 구성 요소): 실제 코드에 존재하는 물리적 부품들(라이브러리, 주요 변수/상태, 핵심 함수 등)을 리스트 형태로 나열하세요.
4. flow (데이터/실행 흐름): 코드의 실제 실행 순서와 데이터가 변하는 과정을 번호를 매겨 상세히 기록하세요. 각 단계 사이에는 반드시 빈 줄을 삽입하세요.
5. io (기술적 입출력): 입력(Parameters)과 출력(Returns)을 명시하세요. 항목별로 줄바꿈을 사용하세요.

Code:
\`\`\`
${codeSnippet}
\`\`\`
`;

  const responsePromise = ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "기술적 제목 ('핵심 기능 + 기술' 형식)" },
          summary: { type: Type.STRING, description: "기술적 역할 요약" },
          components: { type: Type.STRING, description: "기술적 구성 요소" },
          flow: { type: Type.STRING, description: "데이터/실행 흐름" },
          io: { type: Type.STRING, description: "기술적 입출력" }
        },
        required: ["title", "summary", "components", "flow", "io"]
      }
    }
  });

  const response = await withTimeout(responsePromise, 45000, { text: "{}" });

  try {
    const result = JSON.parse(response.text || "{}");
    if (!result.title) {
      return { title: title, summary: "", components: "", flow: "", io: "" };
    }
    return result;
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    return { title: title, summary: "", components: "", flow: "", io: "" };
  }
};

// Phase 3: 설계도 매핑 및 생성
export const mapToLogicNote = async (snapshotTitle: string, snapshotSummary: string, existingLogics: Note[]) => {
  const logicsContext = existingLogics.map(l => `ID: ${l.id}, Title: ${l.title}, Summary: ${l.summary}`).join('\n');
  
  const prompt = `새로운 Snapshot 노트가 추출되었습니다.
Snapshot Title: ${snapshotTitle}
Snapshot Summary: ${snapshotSummary}

기존 Logic 노트 목록:
${logicsContext || "없음"}

이 Snapshot이 기존 Logic 노트 중 하나에 속하는지 판단하세요.
속한다면 해당 Logic 노트의 ID를 'existingLogicId'에 반환하세요.
적절한 부모가 없다면 새로운 Logic 노트를 제안하기 위해 'newLogicTitle'과 'newLogicSummary'를 한국어로 작성하여 반환하세요.
`;

  const responsePromise = ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          existingLogicId: { type: Type.STRING, description: "기존 Logic 노트의 ID (없으면 빈 문자열)" },
          newLogicTitle: { type: Type.STRING, description: "새로운 Logic 노트 제목 (기존 ID가 없을 때만)" },
          newLogicSummary: { type: Type.STRING, description: "새로운 Logic 노트 요약 (기존 ID가 없을 때만)" }
        }
      }
    }
  });

  const response = await withTimeout(responsePromise, 30000, { text: "{}" });

  try {
    return JSON.parse(response.text || "{}");
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    return {};
  }
};

// Re-format existing note for better readability
export const reformatNote = async (note: Partial<Note>) => {
  const prompt = `다음 노트를 가독성 있게 재구성하세요.
반드시 한국어로 작성해야 합니다.

가독성을 극대화하기 위해 다음 규칙을 엄격히 준수하세요:
1. 모든 항목은 마크다운(Markdown) 형식을 사용하세요.
2. 'flow'와 'components'는 반드시 마크다운 리스트(- 또는 1.) 형식을 사용하세요. 가독성을 위해 리스트 항목(1. 2. 3. 등) 사이에는 **반드시 빈 줄(Empty Line)을 하나씩 삽입**하세요. (Loose List 형태)
3. 'summary'와 'io'도 정보가 많을 경우 줄바꿈을 적극적으로 사용하세요.

기존 내용:
Summary: ${note.summary}
Components: ${note.components}
Flow: ${note.flow}
IO: ${note.io}
`;

  const responsePromise = ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          components: { type: Type.STRING },
          flow: { type: Type.STRING },
          io: { type: Type.STRING }
        },
        required: ["summary", "components", "flow", "io"]
      }
    }
  });

  const response = await withTimeout(responsePromise, 30000, { text: "{}" });

  try {
    return JSON.parse(response.text || "{}");
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    return note;
  }
};

// Translate technical Snapshot data to Business Logic data
export const translateToBusinessLogic = async (technicalData: { title: string, summary: string, components: string, flow: string, io: string }) => {
  const prompt = `다음은 코드의 기술적 분석 내용(Snapshot)입니다. 이를 비전공자 개발자가 이해할 수 있는 '비즈니스 로직(의도)'으로 번역하세요.

대칭성 유지: 반드시 동일하게 '제목-요약-구성요소-흐름-입출력' 5단계 구조를 유지해야 합니다.

가독성을 극대화하기 위해 다음 규칙을 엄격히 준수하세요:
1. 모든 항목은 마크다운(Markdown) 형식을 사용하세요.
2. 'flow'와 'components'는 반드시 마크다운 리스트(- 또는 1.) 형식을 사용하세요. 가독성을 위해 리스트 항목(1. 2. 3. 등) 사이에는 **반드시 빈 줄(Empty Line)을 하나씩 삽입**하세요. (Loose List 형태)
3. 'summary'와 'io'도 정보가 많을 경우 줄바꿈을 적극적으로 사용하세요.

번역 규칙:
0. 제목(title): '서비스 명칭 + 핵심 가치' (사용자 경험/체험 중심) 형식으로 작성하되, 단일 책임 원칙에 따라 '가장 핵심적인 단 하나의 가치'만 명시하세요. 'A 및 B', 'A와 B'처럼 여러 기능을 나열하지 마세요. 수식어를 빼고 무엇을 하는 기능인지만 명확히 합니다. (예: '중복 방지 폴더 생성', '실시간 재고 반영', '사용자 인증 시스템')
1. 기술적 구성 요소(변수명, 라이브러리, 특정 함수명 등) -> 비즈니스 구성 요소(비즈니스 개념, 기획 요소, 사용자 경험 요소)로 번역하세요.
2. 실행 흐름(코드 실행 순서, 루프, 조건문 등) -> 논리적 흐름(사람의 의사결정 순서, 서비스 시나리오, 비즈니스 프로세스)으로 번역하세요.
3. 기술적 입출력 -> 비즈니스적 입출력(사용자가 제공하는 정보, 시스템이 사용자에게 돌려주는 결과물)으로 번역하세요.

기술적 데이터:
원본 식별자 및 기술적 제목: ${technicalData.title}
요약: ${technicalData.summary}
구성요소: ${technicalData.components}
흐름: ${technicalData.flow}
입출력: ${technicalData.io}
`;

  const responsePromise = ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "비즈니스 친화적인 직관적인 한국어 제목 ('서비스 명칭 + 핵심 가치' 형식)" },
          summary: { type: Type.STRING, description: "비즈니스 요약" },
          components: { type: Type.STRING, description: "비즈니스 구성 요소" },
          flow: { type: Type.STRING, description: "논리적 흐름" },
          io: { type: Type.STRING, description: "비즈니스 입출력" }
        },
        required: ["title", "summary", "components", "flow", "io"]
      }
    }
  });

  const response = await withTimeout(responsePromise, 45000, { text: "{}" });

  try {
    const result = JSON.parse(response.text || "{}");
    if (!result.title) {
      return {
        title: technicalData.title || "Untitled",
        summary: technicalData.summary || "",
        components: technicalData.components || "",
        flow: technicalData.flow || "",
        io: technicalData.io || ""
      };
    }
    return result;
  } catch (e) {
    console.error("Failed to translate to business logic", e);
    return technicalData;
  }
};

export const checkImplementationConflict = async (
  implementedLogic: { title: string, summary: string, flow: string },
  plannedLogic: { title: string, summary: string, flow: string }
) => {
  const prompt = `기획된 비즈니스 로직(Planned Logic)과 실제 구현된 비즈니스 로직(Implemented Logic) 간의 충돌(Conflict) 여부를 판단하세요.

[기획된 비즈니스 로직 (Logic B)]
제목: ${plannedLogic.title}
요약: ${plannedLogic.summary}
흐름: ${plannedLogic.flow || '없음'}

[실제 구현된 비즈니스 로직 (Logic A)]
제목: ${implementedLogic.title}
요약: ${implementedLogic.summary}
흐름: ${implementedLogic.flow || '없음'}

판단 규칙:
1. 실제 구현된 로직이 기획된 로직의 핵심 의도와 정면으로 모순되거나, 필수적인 비즈니스 흐름이 누락/변질되었다면 'hasConflict'를 true로 반환하세요.
2. 단순히 기술적 상세함의 차이나, 기획을 해치지 않는 선에서의 추가 구현이라면 false를 반환하세요.
3. 사용자는 비전공자입니다. 차이점을 설명할 때 반드시 일상적인 언어로 풀어서 설명하고, 관련된 전문 용어는 괄호 안에 병기하세요. 또한 이 차이가 앱에 어떤 영향을 미치는지(Impact)도 간단히 설명하세요.
4. [매우 중요] 'design'과 'code' 필드에는 절대 전체 코드나 긴 흐름을 복사하지 마세요. 오직 차이가 발생하는 핵심 부분만 1~2문장으로 아주 짧게 요약해서 작성하세요.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "hasConflict": true 또는 false,
  "summary": "충돌에 대한 비전공자 친화적인 전체 요약 (hasConflict가 true일 때만 포함)",
  "differences": [
    {
      "aspect": "차이가 발생한 부분 (예: 데이터 저장 위치)",
      "design": "기획된 내용 (예: 사용자의 기기에만 임시로 저장하기로 기획됨 (Local Storage))",
      "code": "실제 구현된 내용 (예: 클라우드 서버에 영구적으로 저장하도록 구현됨 (Firestore))",
      "impact": "이 차이가 앱과 사용자에게 미치는 영향"
    }
  ]
}`;

  const responsePromise = ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          hasConflict: { type: Type.BOOLEAN },
          summary: { type: Type.STRING },
          differences: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                aspect: { type: Type.STRING },
                design: { type: Type.STRING },
                code: { type: Type.STRING },
                impact: { type: Type.STRING }
              },
              required: ["aspect", "design", "code", "impact"]
            }
          }
        },
        required: ["hasConflict"]
      }
    }
  });

  const response = await withTimeout(responsePromise, 30000, { text: "{}" });

  try {
    const result = JSON.parse(response.text || "{}");
    return {
      isConflict: result.hasConflict || false,
      conflictDetails: result.hasConflict ? {
        summary: result.summary || "",
        differences: result.differences || []
      } : undefined
    };
  } catch (e) {
    console.error("Failed to check conflict", e);
    return { isConflict: false };
  }
};

export const mapLogicToModule = async (
  logicData: { title: string, summary: string },
  existingModules: { id: string, title: string, summary: string }[]
) => {
  const prompt = `다음 비즈니스 로직(Logic)이 속할 가장 적절한 상위 그룹(Module)을 찾으세요.

[비즈니스 로직 (Logic)]
제목: ${logicData.title}
요약: ${logicData.summary}

[기존 모듈 후보군 (Module)]
${existingModules.length > 0 ? JSON.stringify(existingModules, null, 2) : "기존 모듈 없음"}

판단 규칙:
1. 이 로직을 포함하기에 가장 적절한 기존 Module이 있다면 해당 ID를 'mappedModuleId'로 반환하세요.
2. 적절한 Module이 없다면 'mappedModuleId'를 null로 반환하고, 이 로직을 포함할 수 있는 새로운 상위 Module의 제목과 요약을 'suggestedTitle', 'suggestedSummary'로 제안하세요.

[새로운 모듈 제안 시 엄격한 제약 조건]
- suggestedTitle: 반드시 20자 이내의 명사형으로만 작성하세요. (예: "노트 데이터 동기화 시스템") "제안합니다", "모듈입니다" 등의 서술어, 부연 설명, 특수문자는 절대 포함하지 마세요.
- suggestedSummary: 1~2문장으로 간결하게 핵심 역할만 작성하세요.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "mappedModuleId": "일치하는 ID 또는 null",
  "suggestedTitle": "새로운 모듈 제목 (mappedModuleId가 null일 때)",
  "suggestedSummary": "새로운 모듈 요약 (mappedModuleId가 null일 때)"
}`;

  const responsePromise = ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          mappedModuleId: { type: Type.STRING, nullable: true },
          suggestedTitle: { type: Type.STRING, nullable: true },
          suggestedSummary: { type: Type.STRING, nullable: true }
        },
        required: []
      }
    }
  });

  const response = await withTimeout(responsePromise, 30000, { text: "{}" });

  try {
    const result = JSON.parse(response.text || "{}");
    if (result.mappedModuleId && !existingModules.find(m => m.id === result.mappedModuleId)) {
      result.mappedModuleId = null;
    }
    return {
      mappedModuleId: result.mappedModuleId || null,
      suggestedTitle: result.suggestedTitle || null,
      suggestedSummary: result.suggestedSummary || null
    };
  } catch (e) {
    console.error("Failed to map module", e);
    return { mappedModuleId: null, suggestedTitle: null, suggestedSummary: null };
  }
};

export const getEmbeddingsBulk = async (texts: string[]): Promise<number[][]> => {
  if (!texts || texts.length === 0) return [];
  try {
    const promises = texts.map(text => 
      withTimeout(
        ai.models.embedContent({
          model: 'gemini-embedding-2-preview',
          contents: text
        }),
        30000,
        { embeddings: [{ values: [] }] } as any
      )
    );
    const results = await Promise.all(promises);
    return results.map(res => res.embeddings?.[0]?.values || []);
  } catch (e) {
    console.error("Bulk embedding failed", e);
    return texts.map(() => []);
  }
};

export const cosineSimilarity = (a: number[], b: number[]) => {
  if (!a || !b || a.length === 0 || b.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] ** 2;
    normB += b[i] ** 2;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

export const mapLogicsToModulesBulk = async (
  logicsWithCandidates: { 
    index: number, 
    title: string, 
    summary: string, 
    candidateModules: { id: string, title: string, summary: string }[] 
  }[]
) => {
  const prompt = `당신은 여러 개의 비즈니스 로직을 적절한 상위 모듈(Module)로 일괄 그룹화하는 시스템입니다.

[분류할 비즈니스 로직 및 후보 모듈 목록]
${JSON.stringify(logicsWithCandidates, null, 2)}

판단 규칙:
1. 각 로직(index)별로 제공된 'candidateModules' 중 가장 적절한 기존 Module이 있다면 해당 ID를 'mappedModuleId'로 지정하세요.
2. 적절한 Module이 없다면 'mappedModuleId'를 null로 하고, 새로운 상위 Module을 제안하세요 ('suggestedTitle', 'suggestedSummary').
3. 여러 로직이 동일한 새로운 모듈에 속해야 한다면, 동일한 'suggestedTitle'을 사용하여 하나로 묶일 수 있게 하세요.

[새로운 모듈 제안 시 엄격한 제약 조건]
- suggestedTitle: 반드시 20자 이내의 명사형으로만 작성하세요. (예: "노트 데이터 동기화 시스템") 서술어, 부연 설명, 특수문자 절대 금지.
- suggestedSummary: 1~2문장으로 간결하게 핵심 역할만 작성.

반드시 아래 JSON 배열 형식으로만 응답하세요:
[
  {
    "index": 0,
    "mappedModuleId": "일치하는 ID 또는 null",
    "suggestedTitle": "새로운 모듈 제목 (null일 때)",
    "suggestedSummary": "새로운 모듈 요약 (null일 때)"
  }
]`;

  const responsePromise = ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            index: { type: Type.INTEGER },
            mappedModuleId: { type: Type.STRING, nullable: true },
            suggestedTitle: { type: Type.STRING, nullable: true },
            suggestedSummary: { type: Type.STRING, nullable: true }
          },
          required: ["index"]
        }
      }
    }
  });

  const response = await withTimeout(responsePromise, 45000, { text: "[]" });

  try {
    const result = JSON.parse(response.text || "[]");
    return Array.isArray(result) ? result : [];
  } catch (e) {
    console.error("Failed to bulk map modules", e);
    return [];
  }
};

export const generateFixGuide = async (note: Note, fileContent: string) => {
  const prompt = `기존 설계 문서(Logic Note)와 실제 구현된 코드(Github File) 사이에 충돌(Conflict)이 발생했습니다.
개발자는 "설계가 맞습니다"라고 판단했습니다. 즉, 현재 코드가 기존 설계 의도와 다르게 잘못 구현되었거나 누락된 부분이 있습니다.

아래의 [기존 설계 문서]와 [현재 코드]를 비교 분석하여, 코드를 어떻게 수정해야 설계에 부합하게 되는지 **구현 보정 가이드(가이드라인)**를 마크다운 형식으로 작성해 주세요.

[기존 설계 문서]
제목: ${note.title}
요약: ${note.summary}
구성요소: ${note.components}
흐름: ${note.flow}
입출력: ${note.io}

[현재 코드]
\`\`\`
${fileContent}
\`\`\`

가이드라인 작성 규칙:
1. [대상 독자] 사용자는 코딩을 모르는 비전공자(기획자)입니다. 따라서 **절대 구체적인 코드(코드 스니펫, 변수명, 함수명 등)를 제시하지 마세요.**
2. [작성 방식] 코드를 어떻게 수정해야 하는지, 프로그램이 작동해야 하는 **'논리적 흐름'**을 순서대로(1, 2, 3...) 풀어서 설명하세요.
3. [출력 예시] 반드시 아래와 같은 문체와 구조로 작성하세요.
   - 1. 사용자가 현재 선택한 프로젝트가 올바른지 확인하며, 선택된 프로젝트가 없다면 빈 화면을 유지합니다.
   - 2. 저장되어 있는 모든 메모 정보를 데이터베이스에서 불러옵니다.
   - 3. 불러온 전체 메모 중 현재 선택한 프로젝트와 연결된 메모만 골라냅니다.
   - 4. 최종적으로 정리된 메모 리스트를 사용자 화면에 반영하여 보여줍니다.
`;

  const responsePromise = ai.models.generateContent({
    model: MODEL,
    contents: prompt,
  });

  const response = await withTimeout(responsePromise, 45000, { text: "가이드를 생성하지 못했습니다." } as any);

  return response.text || "가이드를 생성하지 못했습니다.";
};

// Phase 4: Dynamic MVP Scoping
// Phase 5: AI C-Suite Evaluation
export const evaluateWithCSuite = async (noteTitle: string, noteSummary: string, noteType: string) => {
  const prompt = `당신은 혁신적인 기술 스타트업의 가상 임원진(AI C-Suite: CTO, CMO, CFO)입니다.
다음 기획안(${noteType})을 각자의 전문 분야 관점에서 날카롭고 현실적으로 평가하세요.

[기획안]
제목: ${noteTitle}
요약: ${noteSummary}

[평가 지침]
- CTO (최고 기술 책임자): 기술적 실현 가능성, 확장성, 아키텍처, 기술 부채, 서버 부하 등을 평가합니다.
- CMO (최고 마케팅 책임자): 유저 획득(Acquisition), 리텐션, 바이럴 루프, UX, 시장 매력도 등을 평가합니다.
- CFO (최고 재무 책임자): 개발 비용, 유지보수 비용(Burn Rate), 예상 ROI, 수익성 등을 평가합니다.
- Consensus (최종 결의안): 세 임원의 의견을 종합한 1문장짜리 최종 권고안 (예: "P1으로 즉시 진행", "비용 문제로 보류", "UX 개선 후 재검토" 등).

반드시 아래 JSON 형식으로만 응답하세요:
{
  "cto": "CTO의 평가 (2~3문장)",
  "cmo": "CMO의 평가 (2~3문장)",
  "cfo": "CFO의 평가 (2~3문장)",
  "consensus": "최종 결의안 (1문장)"
}
`;

  const responsePromise = ai.models.generateContent({
    model: PRO_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          cto: { type: Type.STRING },
          cmo: { type: Type.STRING },
          cfo: { type: Type.STRING },
          consensus: { type: Type.STRING }
        },
        required: ["cto", "cmo", "cfo", "consensus"]
      }
    }
  });

  const response = await withTimeout(responsePromise, 60000, { text: "{}" } as any);
  if (!response || !response.text) {
    throw new Error("Failed to generate C-Suite evaluation.");
  }

  try {
    const jsonStr = response.text.trim();
    return JSON.parse(jsonStr) as { cto: string, cmo: string, cfo: string, consensus: string };
  } catch (e) {
    console.error("Failed to parse C-Suite JSON", e);
    throw new Error("Invalid JSON format from AI.");
  }
};

export const scopeMVP = async (notes: Note[], constraint: string) => {
  const prompt = `당신은 세계 최고의 프로덕트 매니저이자 비즈니스 전략가입니다.
사용자가 제시한 제약 조건(예: "이번 주말까지 런칭", "핵심 결제만 집중")에 맞춰, 현재 기획된 시스템(Module, Logic)들의 우선순위를 재조정(MVP Scoping)하세요.

[사용자 제약 조건]
${constraint}

[현재 기획된 시스템 목록]
${notes.map(n => `ID: ${n.id} | Type: ${n.noteType} | Title: ${n.title} | Summary: ${n.summary}`).join('\n')}

[우선순위 분류 기준]
- P1 (Must-have): 제약 조건을 맞추기 위해 절대적으로 필수적인 핵심 기능. 없으면 서비스가 성립하지 않음.
- P2 (Nice-to-have): 있으면 좋지만, 당장 런칭에는 제외해도 되는 기능.
- P3 (Backlog): 나중에 여유가 될 때 개발할 기능.

각 ID에 대해 새로운 우선순위(P1, P2, P3)와 그 이유(1문장)를 JSON 배열로 반환하세요.
반드시 아래 JSON 형식으로만 응답하세요:
{
  "scoping": [
    {
      "id": "노트 ID",
      "priority": "P1",
      "reason": "우선순위를 이렇게 설정한 이유 (비즈니스 관점)"
    }
  ]
}
`;

  const responsePromise = ai.models.generateContent({
    model: PRO_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          scoping: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                priority: { type: Type.STRING },
                reason: { type: Type.STRING }
              },
              required: ["id", "priority", "reason"]
            }
          }
        },
        required: ["scoping"]
      }
    }
  });

  const response = await withTimeout(responsePromise, 60000, { text: "[]" } as any);
  if (!response || !response.text) {
    throw new Error("Failed to generate MVP scoping.");
  }

  try {
    const jsonStr = response.text.trim();
    return JSON.parse(jsonStr).scoping as { id: string, priority: 'P1' | 'P2' | 'P3', reason: string }[];
  } catch (e) {
    console.error("Failed to parse MVP scoping JSON", e);
    throw new Error("Invalid JSON format from AI.");
  }
};

// Phase 6: Code-to-Cost (Burn Rate Estimator)
export const estimateProjectCost = async (notes: Note[]) => {
  const prompt = `당신은 세계 최고의 클라우드 아키텍트이자 재무 책임자(CFO)입니다.
현재 기획된 시스템(특히 P1, P2 우선순위의 Module, Logic)을 분석하여, 이 MVP를 런칭하고 초기 1개월간 운영할 때 예상되는 인프라 및 API 비용(Burn Rate)을 추정하세요.

[현재 기획된 시스템 목록]
${notes.map(n => `Type: ${n.noteType} | Priority: ${n.priority} | Title: ${n.title} | Summary: ${n.summary}`).join('\n')}

[비용 추정 지침]
- AWS, Firebase, Vercel, OpenAI 등 실제 널리 쓰이는 서비스의 요금제를 기준으로 현실적으로 추정하세요.
- 초기 스타트업의 MVP 수준(월간 활성 사용자 1,000~5,000명 가정)으로 계산하세요.
- 각 항목별로 구체적인 예상 금액(원화 ₩ 또는 달러 $)과 그 이유를 짧게 명시하세요.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "totalMonthlyCost": "총 예상 월간 비용 (예: ₩150,000 / 월)",
  "infrastructure": "서버, DB, 호스팅 비용 내역 및 이유 (2~3문장)",
  "thirdPartyApis": "AI, 결제, 알림 등 외부 API 비용 내역 및 이유 (2~3문장)",
  "maintenance": "유지보수, 백업, 기타 숨겨진 비용 (1~2문장)",
  "summary": "비용 최적화를 위한 CFO의 한 줄 조언"
}
`;

  const responsePromise = ai.models.generateContent({
    model: PRO_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          totalMonthlyCost: { type: Type.STRING },
          infrastructure: { type: Type.STRING },
          thirdPartyApis: { type: Type.STRING },
          maintenance: { type: Type.STRING },
          summary: { type: Type.STRING }
        },
        required: ["totalMonthlyCost", "infrastructure", "thirdPartyApis", "maintenance", "summary"]
      }
    }
  });

  const response = await withTimeout(responsePromise, 60000, { text: "{}" } as any);
  if (!response || !response.text) {
    throw new Error("Failed to generate cost estimate.");
  }

  try {
    const jsonStr = response.text.trim();
    return JSON.parse(jsonStr) as { totalMonthlyCost: string, infrastructure: string, thirdPartyApis: string, maintenance: string, summary: string };
  } catch (e) {
    console.error("Failed to parse Cost Estimate JSON", e);
    throw new Error("Invalid JSON format from AI.");
  }
};

export const generateModuleFromCluster = async (logics: {title: string, summary: string}[]) => {
  const prompt = `당신은 세계 최고의 소프트웨어 아키텍트입니다.
다음은 수학적 유사도를 기반으로 군집화된 로직(Logic)들의 목록입니다. 이 로직들을 포괄하는 하나의 모듈(Module)을 설계하세요.

[포함된 로직 목록]
${JSON.stringify(logics, null, 2)}

[요구사항]
1. 모듈의 이름(title)과 한 줄 요약(summary)을 **한국어**로 작성하세요.
2. **중요**: 제목(title)은 개발자가 아닌 일반 사용자나 기획자도 한눈에 이해할 수 있을 만큼 **매우 직관적이고 쉬운 단어**를 사용하세요. (예: 'AuthModule' 대신 '사용자 인증 및 보안 관리')
3. 모듈의 상세 본문(body)은 다음 Markdown 템플릿을 엄격히 따라 작성하세요:

### 🎯 역할 및 목적 (Role & Purpose)
이 모듈이 시스템 내에서 어떤 역할을 수행하는지 1~2줄로 요약.

### ⚙️ 핵심 로직 (Core Logics)
포함된 로직들이 구체적으로 어떤 흐름으로 작동하는지 설명.

### 🔌 인터페이스 및 의존성 (Interfaces & Dependencies)
이 모듈이 외부(다른 모듈이나 사용자)와 어떻게 상호작용하는지 (입력/출력 관점).

### ⚠️ 예외 및 엣지 케이스 (Edge Cases)
이 모듈이 처리해야 할 잠재적 오류나 예외 상황.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "title": "직관적인 한국어 모듈 이름",
  "summary": "한국어 모듈 한 줄 요약",
  "body": "마크다운 형식의 상세 본문"
}`;

  const responsePromise = ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          summary: { type: Type.STRING },
          body: { type: Type.STRING }
        },
        required: ["title", "summary", "body"]
      }
    }
  });

  const response = await withTimeout(responsePromise, 30000, { text: "{}" } as any);
  try {
    return JSON.parse(response.text || "{}");
  } catch (e) {
    console.error("Failed to generate module from cluster", e);
    return { title: "Unknown Module", summary: "Failed to generate", body: "" };
  }
};

export const generateDomainsFromModules = async (modules: {id: string, title: string, summary: string}[]) => {
  const prompt = `당신은 세계 최고의 소프트웨어 아키텍트입니다.
다음은 시스템을 구성하는 모듈(Module)들의 목록입니다. 이 모듈들을 분석하여 3~5개의 최상위 도메인(Domain)으로 분류하고 설계하세요.

[모듈 목록]
${JSON.stringify(modules, null, 2)}

[요구사항]
1. 각 도메인의 이름(title)과 요약(summary)을 **한국어**로 작성하세요.
2. **중요**: 도메인 제목(title)은 시스템의 거대한 뼈대를 나타내므로, 누구나 한눈에 시스템의 큰 구역을 파악할 수 있도록 **매우 직관적이고 명확한 한국어 단어**를 사용하세요. (예: 'CoreDomain' 대신 '핵심 서비스 엔진')
3. 각 도메인에 속하는 모듈들의 ID(moduleIds)를 배열로 매핑하세요. 모든 모듈은 반드시 하나의 도메인에 속해야 합니다.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "domains": [
    {
      "title": "직관적인 한국어 도메인 이름",
      "summary": "한국어 도메인 요약",
      "moduleIds": ["모듈 ID 1", "모듈 ID 2"]
    }
  ]
}`;

  const responsePromise = ai.models.generateContent({
    model: PRO_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          domains: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                summary: { type: Type.STRING },
                moduleIds: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                }
              },
              required: ["title", "summary", "moduleIds"]
            }
          }
        },
        required: ["domains"]
      }
    }
  });

  const response = await withTimeout(responsePromise, 60000, { text: "{}" } as any);
  try {
    return JSON.parse(response.text || "{}");
  } catch (e) {
    console.error("Failed to generate domains from modules", e);
    return { domains: [] };
  }
};

// Phase 7: PR/FAQ & Pitch Deck Generator (Amazon Working Backwards)
export const generatePitchDeck = async (notes: Note[]) => {
  const prompt = `당신은 실리콘밸리의 탑티어 벤처캐피탈(VC) 파트너이자, 아마존(Amazon)의 신제품 기획자입니다.
현재 기획된 시스템(Domain, Module, Logic)을 분석하여, 코드를 짜기 전에 제품의 시장 가치를 증명하는 '보도자료(PR)'와 '투자자용 피치덱(Pitch Deck)'을 작성하세요. (아마존의 Working Backwards 방법론 적용)

[현재 기획된 시스템 목록]
${notes.map(n => `Type: ${n.noteType} | Priority: ${n.priority} | Title: ${n.title} | Summary: ${n.summary}`).join('\n')}

[작성 지침]
- pressRelease: 앱스토어 런칭 첫날 배포할 가상의 보도자료 (고객의 문제를 어떻게 극적으로 해결했는지 강조, 마크다운 포맷)
- elevatorPitch: 투자자에게 30초 안에 설명할 수 있는 강력한 한 줄 소개와 핵심 가치 (2~3문장)
- problemAndSolution: 시장의 기존 문제점(Problem)과 이 프로덕트가 제시하는 혁신적인 해결책(Solution)
- targetAudience: 핵심 타겟 고객 페르소나와 그들이 이 제품에 열광할 수밖에 없는 이유
- businessModel: 어떻게 돈을 벌 것인가? (구독, 수수료, 광고 등) 수익화 전략

반드시 아래 JSON 형식으로만 응답하세요:
{
  "pressRelease": "보도자료 내용 (마크다운)",
  "elevatorPitch": "엘리베이터 피치",
  "problemAndSolution": "문제와 해결책",
  "targetAudience": "타겟 고객",
  "businessModel": "비즈니스 모델"
}
`;

  const responsePromise = ai.models.generateContent({
    model: PRO_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          pressRelease: { type: Type.STRING },
          elevatorPitch: { type: Type.STRING },
          problemAndSolution: { type: Type.STRING },
          targetAudience: { type: Type.STRING },
          businessModel: { type: Type.STRING }
        },
        required: ["pressRelease", "elevatorPitch", "problemAndSolution", "targetAudience", "businessModel"]
      }
    }
  });

  const response = await withTimeout(responsePromise, 60000, { text: "{}" } as any);
  if (!response || !response.text) {
    throw new Error("Failed to generate Pitch Deck.");
  }

  try {
    const jsonStr = response.text.trim();
    return JSON.parse(jsonStr) as { pressRelease: string, elevatorPitch: string, problemAndSolution: string, targetAudience: string, businessModel: string };
  } catch (e) {
    console.error("Failed to parse Pitch Deck JSON", e);
    throw new Error("Invalid JSON format from AI.");
  }
};

// Phase 8: Competitor Teardown (경쟁사 역설계 및 블루오션 탐색기)
export const analyzeCompetitor = async (competitorName: string, notes: Note[]) => {
  const prompt = `당신은 세계 최고의 프로덕트 전략가이자 리버스 엔지니어링 전문가입니다.
사용자가 입력한 경쟁사('${competitorName}')를 분석하고, 현재 기획 중인 우리 시스템과 비교하여 '블루오션 전략'을 도출하세요.

[우리 시스템 기획 상태]
${notes.map(n => `Type: ${n.noteType} | Title: ${n.title} | Summary: ${n.summary}`).join('\n')}

[분석 지침]
- coreMechanics: 해당 경쟁사의 핵심 성공 요인과 동작 원리 (2~3문장)
- weaknesses: 경쟁사의 치명적인 약점이나 고객들이 불편해하는 지점 (2~3문장)
- blueOceanStrategy: 경쟁사의 약점을 파고들어 우리 시스템이 취해야 할 '블루오션' 포지셔닝 (2~3문장)
- actionableLogics: 우리 시스템에 즉시 추가해야 할 차별화된 핵심 로직(기능) 아이디어 3가지 (배열 형식)

반드시 아래 JSON 형식으로만 응답하세요:
{
  "coreMechanics": "경쟁사 핵심 원리",
  "weaknesses": "경쟁사 약점",
  "blueOceanStrategy": "우리의 블루오션 전략",
  "actionableLogics": ["차별화 로직 1", "차별화 로직 2", "차별화 로직 3"]
}
`;

  const responsePromise = ai.models.generateContent({
    model: PRO_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          coreMechanics: { type: Type.STRING },
          weaknesses: { type: Type.STRING },
          blueOceanStrategy: { type: Type.STRING },
          actionableLogics: { 
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        },
        required: ["coreMechanics", "weaknesses", "blueOceanStrategy", "actionableLogics"]
      }
    }
  });

  const response = await withTimeout(responsePromise, 60000, { text: "{}" } as any);
  if (!response || !response.text) {
    throw new Error("Failed to analyze competitor.");
  }

  try {
    const jsonStr = response.text.trim();
    return JSON.parse(jsonStr) as { coreMechanics: string, weaknesses: string, blueOceanStrategy: string, actionableLogics: string[] };
  } catch (e) {
    console.error("Failed to parse Competitor Analysis JSON", e);
    throw new Error("Invalid JSON format from AI.");
  }
};

// Phase 9: Proactive AI Co-founder (Continuous Ideation)
export const refineIdeaWithSparring = async (notes: Note[], nudge: ProactiveNudge, userResponse: string) => {
  const prompt = `당신은 사용자의 아이디어를 구체화하는 AI Co-founder입니다.
사용자가 당신의 도발적인 질문(Nudge)에 대해 반박하거나 새로운 아이디어를 제시했습니다.
사용자의 응답을 바탕으로, 실제 시스템에 추가할 수 있는 구체적인 기획안(Note)을 작성하세요.

[AI의 도발적 질문 (Nudge)]
타입: ${nudge.nudgeType}
질문: ${nudge.question}

[사용자의 반응 (Sparring)]
"${userResponse}"

[현재 시스템의 노트들]
${notes.map(n => `Title: ${n.title}`).join('\n')}

위 내용을 바탕으로, 사용자의 의도를 완벽하게 반영한 새로운 모듈(Note)을 설계하세요.
반드시 아래 JSON 형식으로만 응답하세요:
{
  "title": "모듈 이름 (예: VIP 구독 결제 시스템)",
  "content": "사용자의 의도가 반영된 구체적인 기능 설명 및 비즈니스 로직",
  "folder": "적절한 도메인 분류 (예: Monetization, Core, Growth 등)",
  "priority": "P1" | "P2" | "P3",
  "noteType": "Domain" | "Module" | "Logic"
}
`;

  const responsePromise = ai.models.generateContent({
    model: PRO_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          content: { type: Type.STRING },
          folder: { type: Type.STRING },
          priority: { type: Type.STRING },
          noteType: { type: Type.STRING }
        },
        required: ["title", "content", "folder", "priority", "noteType"]
      }
    }
  });

  const response = await withTimeout(responsePromise, 60000, { text: "{}" } as any);
  if (!response || !response.text) {
    throw new Error("Failed to refine idea with sparring.");
  }

  try {
    const jsonStr = response.text.trim();
    return JSON.parse(jsonStr) as { title: string, content: string, folder: string, priority: 'P1'|'P2'|'P3', noteType: 'Domain'|'Module'|'Logic' };
  } catch (e) {
    console.error("Failed to parse Refined Idea JSON", e);
    throw new Error("Invalid JSON format from AI.");
  }
};
export const generateProactiveNudges = async (notes: Note[], pastNudges: string[] = [], track: 'A' | 'B', targetType?: string) => {
  const lenses = [
    "Gen-Z 타겟", "극단적 미니멀리즘", "게이미피케이션", "하드코어 B2B", 
    "블록체인/Web3", "오프라인 결합", "10배 비싼 프리미엄", "로컬 커뮤니티 기반",
    "구독형 모델", "일회성 이벤트", "AI 완전 자동화", "수동/장인정신"
  ];
  
  const randomLenses = lenses.sort(() => 0.5 - Math.random()).slice(0, 3);

  let typeInstruction = '';
  let typeDefinitions = '';
  let allowedTypes = '';

  if (track === 'A') {
    typeInstruction = targetType 
      ? `반드시 '${targetType}' 타입의 실무적인 제안 1개를 생성하세요.`
      : `반드시 4가지 타입(NextStep, MissingPiece, Growth, EdgeCase) 각각에 대해 1개씩, 총 4개의 실무적인 제안(Nudge)을 생성하세요.`;
    
    typeDefinitions = `[4가지 Nudge 타입 정의 (Track A: 실무/기획 제안)]
1. NextStep (다음 논리적 단계): "현재 'A' 모듈이 있네요. 자연스러운 다음 단계로 [B] 모듈을 추가할까요?"
2. MissingPiece (누락된 필수 기능): "C 도메인은 설계되었는데, [D 로직]이 비어있습니다. 추가하시겠습니까?"
3. Growth (성장 및 수익화): "리텐션을 높이기 위해 [E 프로모션 로직]이나 [F 보상 시스템]을 도입해 보는 건 어떨까요?"
4. EdgeCase (예외 처리): "유저가 G 행동을 했을 때의 [H 예외 처리 로직]이 필요해 보입니다."`;
    
    allowedTypes = `"NextStep" | "MissingPiece" | "Growth" | "EdgeCase"`;
  } else {
    typeInstruction = targetType 
      ? `반드시 '${targetType}' 타입의 도발적인 질문(Nudge) 1개를 생성하세요.`
      : `반드시 4가지 타입(WhatIf, Gap, Constraint, Inversion) 각각에 대해 1개씩, 총 4개의 도발적인 질문(Nudge)을 생성하세요.`;
    
    typeDefinitions = `[4가지 Nudge 타입 정의 (Track B: 비전/피벗 제안)]
1. WhatIf (극단적 비유): "만약 이 앱을 틴더처럼 만든다면?", "링크드인처럼 전문가 네트워크로 푼다면?"
2. Gap (구조적 공백): "결제는 있는데 환불이 없네요?", "유저가 내일 다시 올 이유(Retention)가 없네요?"
3. Constraint (강제 제약): "내일 당장 1개 기능만 런칭해야 한다면?", "예산이 0원이라면?"
4. Inversion (역발상): "이 프로젝트를 가장 빠르고 확실하게 망하게 하려면?"`;
    
    allowedTypes = `"WhatIf" | "Gap" | "Constraint" | "Inversion"`;
  }

  const blacklistInstruction = pastNudges.length > 0
    ? `\n[주의: 다음 아이디어들은 이미 사용자가 거절했거나 검토한 내용이므로 **절대 중복해서 제안하지 마세요**]\n${pastNudges.map(n => `- ${n}`).join('\n')}\n`
    : '';

  const prompt = `당신은 사용자의 아이디어를 자극하고 시스템을 발전시키는 AI Co-founder입니다.
사용자의 프로젝트 노트들을 분석하여, ${track === 'A' ? '당장 개발해야 할 구체적인 기능이나 로직을 제안하세요.' : '정답을 주지 말고 사용자가 반박하거나 영감을 얻을 수 있는 도발적인 질문을 생성하세요.'}

${typeInstruction}

[랜덤 관점 (Lens)]
이번 생성에는 다음 관점들을 적극적으로 반영하여 뻔하지 않은 제안을 만드세요:
${randomLenses.join(', ')}
${blacklistInstruction}
${typeDefinitions}

[현재 시스템]
${notes.map(n => `Type: ${n.noteType} | Status: ${n.status} | Title: ${n.title}`).join('\n')}

반드시 아래 JSON 형식으로만 응답하세요:
{
  "nudges": [
    {
      "id": "고유문자열",
      "nudgeType": ${allowedTypes},
      "track": "${track}",
      "context": "현재 상황에 대한 짧은 진단 (예: 현재는 사용자가 혼자 쓰는 툴이네요.)",
      "question": "${track === 'A' ? '구체적인 기능 추가 제안 (예: 회원가입 모듈이 있으니 소셜 로그인 연동을 추가할까요?)' : '도발적이고 극단적인 질문 (예: 만약 이 앱을 틴더처럼 유저끼리 스와이프해서 매칭되게 만든다면 어떨까요?)'}",
      "keywords": ["#키워드1", "#키워드2", "#키워드3"],
      "actionPrompt": "이 아이디어를 시스템에 추가하기 위한 프롬프트"
    }
  ]
}
`;

  const responsePromise = ai.models.generateContent({
    model: PRO_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          nudges: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                nudgeType: { type: Type.STRING },
          context: { type: Type.STRING },
                question: { type: Type.STRING },
                keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                actionPrompt: { type: Type.STRING }
              },
              required: ["id", "nudgeType", "context", "question", "keywords", "actionPrompt"]
            }
          }
        },
        required: ["nudges"]
      }
    }
  });

  const response = await withTimeout(responsePromise, 60000, { text: '{"nudges": []}' } as any);
  
  if (!response || !response.text) {
    console.warn("Gemini returned empty response for nudges, returning empty array.");
    return [];
  }

  try {
    const jsonStr = response.text.trim();
    const parsed = JSON.parse(jsonStr).nudges as any[];
    if (!parsed) return [];
    return parsed.map(n => ({ ...n, track })) as ProactiveNudge[];
  } catch (e) {
    console.error("Failed to parse Nudges JSON", e);
    return [];
  }
};

export const addFeatureBlueprint = async (idea: string, notes: Note[]) => {
  const prompt = `당신은 최고 수준의 소프트웨어 아키텍트입니다.
사용자가 다음 아이디어를 기존 시스템에 추가하려고 합니다: "${idea}"

[기존 시스템]
${notes.map(n => `Type: ${n.noteType} | Title: ${n.title}`).join('\n')}

기존 시스템과 중복되지 않으면서 자연스럽게 연결되는 새로운 Domain, Module, Logic을 설계하세요.
응답 형식은 초기 블루프린트 생성과 동일한 JSON 스키마를 엄격히 따르세요.
`;

  const responsePromise = ai.models.generateContent({
    model: PRO_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          domains: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                summary: { type: Type.STRING },
                modules: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      summary: { type: Type.STRING },
                      logics: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            title: { type: Type.STRING },
                            summary: { type: Type.STRING }
                          },
                          required: ["title", "summary"]
                        }
                      }
                    },
                    required: ["title", "summary", "logics"]
                  }
                }
              },
              required: ["title", "summary", "modules"]
            }
          }
        },
        required: ["domains"]
      }
    }
  });

  const response = await withTimeout(responsePromise, 60000, { text: "[]" } as any);
  if (!response || !response.text) {
    throw new Error("Failed to generate feature blueprint.");
  }

  try {
    const jsonStr = response.text.trim();
    return JSON.parse(jsonStr) as {
      domains: {
        title: string;
        summary: string;
        modules: {
          title: string;
          summary: string;
          logics: { title: string; summary: string; }[];
        }[];
      }[];
    };
  } catch (e) {
    console.error("Failed to parse Feature Blueprint JSON", e);
    throw new Error("Invalid JSON format from AI.");
  }
};
