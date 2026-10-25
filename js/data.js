// Content for the site. Every text has { ko, en }.

// Body parts of the 3D humanoid that a field mainly works on.
export const PARTS = {
  head:  { ko: "머리 (카메라)", en: "head (cameras)" },
  torso: { ko: "몸통 (컴퓨터·IMU)", en: "torso (computer, IMU)" },
  arms:  { ko: "팔", en: "arms" },
  hands: { ko: "손", en: "hands" },
  legs:  { ko: "다리", en: "legs" },
};

export const STAGES = {
  see:   { ko: "보기",   en: "See" },
  think: { ko: "생각",   en: "Think" },
  act:   { ko: "행동",   en: "Act" },
  fix:   { ko: "고치기", en: "Fix" },
};

// Each axis: [letter, label, description]
export const AXES = [
  {
    key: "EI",
    a: { letter: "E", label: { ko: "행동", en: "Act" },  desc: { ko: "몸과 환경에 부딪히며 배운다", en: "Learn by interacting with the world" } },
    b: { letter: "I", label: { ko: "내부", en: "Inside" }, desc: { ko: "모델·기억·계획을 깊게 판다", en: "Dig into models, memory, planning" } },
  },
  {
    key: "SN",
    a: { letter: "S", label: { ko: "몸", en: "Body" },   desc: { ko: "하드웨어·실시간·실제 로봇", en: "Hardware, real-time, real robots" } },
    b: { letter: "N", label: { ko: "두뇌", en: "Brain" }, desc: { ko: "학습·파운데이션 모델·추상화", en: "Learning, foundation models, abstraction" } },
  },
  {
    key: "TF",
    a: { letter: "T", label: { ko: "로직", en: "Logic" },  desc: { ko: "제어·최적화·코드", en: "Control, optimization, code" } },
    b: { letter: "F", label: { ko: "사람", en: "People" }, desc: { ko: "시연·원격조종·사람 데이터", en: "Demos, teleop, human data" } },
  },
  {
    key: "JP",
    a: { letter: "J", label: { ko: "검증", en: "Verify" }, desc: { ko: "안전·신뢰성·재현성", en: "Safety, reliability, reproducibility" } },
    b: { letter: "P", label: { ko: "시도", en: "Try" },    desc: { ko: "프로토타입·탐색·고쳐 가며", en: "Prototype, explore, iterate" } },
  },
];

export const TYPES = {
  ISTJ: {
    stage: "see",
    body: ["head", "torso"],
    motion: "balance",
    act: { ko: "좌우로 무게를 옮기며 내 자세를 추정하는 중", en: "Shifting its weight while estimating its own pose" },
    field: { ko: "센서·구동기 신뢰성과 상태 추정", en: "Sensor & actuator reliability, state estimation" },
    nick:  { ko: "로봇의 감각을 믿게 만드는 검증가", en: "The one who makes robot senses trustworthy" },
    easy:  {
      ko: "로봇이 \"나는 지금 어디에, 어떤 자세로 있지?\"를 정확히 아는 게 모든 것의 시작이에요. 카메라와 관성 센서(IMU)를 서로 맞추고(캘리브레이션), 여러 센서를 합쳐 로봇의 위치와 자세를 추정해요.",
      en: "Everything starts with the robot knowing \"where am I, and how am I posed?\" You calibrate cameras and IMUs (motion sensors) and fuse them to estimate the robot's position and posture.",
    },
    barrier: {
      ko: "걸을 때마다 몸이 흔들리고 발에 충격이 와서 센서 값이 쉽게 틀어져요. 감각이 틀리면 루프는 '보기'에서부터 무너져요.",
      en: "Every step shakes the body and jolts the sensors. If the senses drift, the loop breaks right at \"See\".",
    },
    tools: ["Kalibr", "OpenVINS", "Pinocchio", "ROS 2"],
  },
  ISTP: {
    stage: "act",
    body: ["torso"],
    motion: "step",
    act: { ko: "달리면서 실시간으로 균형 잡는 중 (사람 모션캡처)", en: "Running, balancing in real time (human mocap)" },
    field: { ko: "실시간 제어 루프와 엣지 추론", en: "Real-time control loops & edge inference" },
    nick:  { ko: "1밀리초를 다루는 장인", en: "The craftsperson of milliseconds" },
    easy:  {
      ko: "로봇 관절은 1초에 수백~수천 번 명령을 받아요. 이 명령이 늦지 않게 도착하고, 신경망 정책이 로봇 안의 작은 컴퓨터(Jetson 등)에서 빠르게 돌도록 만드는 일이에요.",
      en: "Robot joints get hundreds to thousands of commands per second. You make sure they arrive on time and that neural policies run fast on the small onboard computer (e.g., Jetson).",
    },
    barrier: {
      ko: "큰 AI 모델은 느린데 몸은 기다려 주지 않아요. '생각'이 아무리 좋아도 '행동'이 늦으면 넘어져요.",
      en: "Big AI models are slow, and the body won't wait. However good the \"Think\" is, a late \"Act\" means a fall.",
    },
    tools: ["ros2_control", "NVIDIA Jetson", "TensorRT", "ONNX Runtime"],
  },
  ISFJ: {
    stage: "think",
    body: ["arms", "hands"],
    motion: "pickplace",
    act: { ko: "물건을 집어 옮기는 시연 동작", en: "A pick-and-place demonstration" },
    field: { ko: "사람 시연 데이터 수집과 품질 관리", en: "Human demonstration data & quality" },
    nick:  { ko: "로봇의 교과서를 만드는 사람", en: "The one who writes the robot's textbook" },
    easy:  {
      ko: "요즘 로봇은 사람이 보여 준 시범(시연)을 보고 배워요. 시연을 편하게 모으는 장비를 만들고, 좋은 데이터와 나쁜 데이터를 골라 정리하는 일이에요.",
      en: "Today's robots learn from human demonstrations. You build tools that make demos easy to collect, and you sort good data from bad.",
    },
    barrier: {
      ko: "데이터가 지저분하면 로봇도 지저분하게 배워요. 양보다 질이 어렵고, 모으는 데 시간과 사람이 많이 들어요.",
      en: "Messy data makes a messy robot. Quality is harder than quantity, and collection costs lots of time and people.",
    },
    tools: ["LeRobot", "UMI gripper", "Project Aria", "Hugging Face Datasets"],
  },
  ISFP: {
    stage: "act",
    body: ["hands"],
    motion: "grasp",
    act: { ko: "손가락을 오므렸다 펴며 쥐는 중", en: "Closing and opening its fingers to grasp" },
    field: { ko: "정교한 손 조작과 시각+촉각 융합", en: "Dexterous hands & visuo-tactile fusion" },
    nick:  { ko: "손끝으로 세상을 느끼는 사람", en: "The one who feels the world through fingertips" },
    easy:  {
      ko: "사람 손처럼 손가락이 여러 개인 로봇 손으로 물건을 잡고, 돌리고, 끼우는 연구예요. 카메라로 보고 촉각 센서로 느껴서 미끄러짐까지 알아채요.",
      en: "Using multi-fingered robot hands to grasp, rotate, and insert objects—seeing with cameras and feeling with touch sensors to catch slips.",
    },
    barrier: {
      ko: "물건을 잡는 순간 손이 물건을 가려서 카메라가 못 봐요. 그래서 '보는 것'과 '느끼는 것'을 합쳐야 해요.",
      en: "The moment the hand grasps, it blocks the camera's view. Seeing and feeling have to work together.",
    },
    tools: ["MuJoCo", "DIGIT / GelSight", "Allegro · Inspire hand", "Isaac Lab"],
  },
  INTJ: {
    stage: "think",
    body: ["torso", "legs"],
    motion: "squat",
    act: { ko: "몸 전체를 계산해 앉았다 일어서는 중", en: "Squatting with whole-body planning" },
    field: { ko: "계층형 계획과 전신 최적 제어", en: "Hierarchical planning & whole-body optimal control" },
    nick:  { ko: "몇 수 앞을 계산하는 전략가", en: "The strategist who plans moves ahead" },
    easy:  {
      ko: "로봇이 \"앞으로 1초 동안 어떻게 움직이는 게 가장 좋을까?\"를 계속 계산하게 만드는 일이에요(MPC). 큰 목표는 위층에서 계획하고, 관절 힘은 아래층에서 최적화하는 구조를 설계해요.",
      en: "You make the robot keep asking \"what's the best way to move over the next second?\" (MPC)—big goals planned on top, joint forces optimized below.",
    },
    barrier: {
      ko: "관절 수십 개짜리 몸 전체를 실시간으로 최적화하기엔 계산이 너무 무거워요. 정확함과 속도 사이의 줄다리기예요.",
      en: "Optimizing a body with dozens of joints in real time is computationally heavy—a constant tug-of-war between accuracy and speed.",
    },
    tools: ["Pinocchio", "Crocoddyl", "MuJoCo MPC", "CasADi"],
  },
  INTP: {
    stage: "think",
    body: ["head"],
    motion: "scan",
    act: { ko: "주변을 둘러보며 3D 기억을 쌓는 중", en: "Looking around to build a 3D memory" },
    field: { ko: "월드 모델과 3D 장면 메모리", en: "World models & 3D scene memory" },
    nick:  { ko: "머릿속에 세상을 짓는 이론가", en: "The theorist who builds the world in their head" },
    easy:  {
      ko: "로봇이 본 것을 3D로 기억하고, \"이렇게 하면 다음엔 이렇게 되겠지\"를 머릿속에서 미리 상상하게 만드는 연구예요.",
      en: "Helping robots remember what they saw in 3D and imagine \"if I do this, that will happen next.\"",
    },
    barrier: {
      ko: "세상은 계속 바뀌는데 기억은 금방 낡아요. 상상(예측)이 조금만 틀려도 계획 전체가 어긋나요.",
      en: "The world keeps changing and memories go stale. A slightly wrong prediction can derail the whole plan.",
    },
    tools: ["gsplat", "Nerfstudio", "NVIDIA Cosmos", "PyTorch"],
  },
  INFJ: {
    stage: "fix",
    body: ["torso"],
    motion: "stop",
    act: { ko: "손을 뻗다가 위험하면 멈추는 중", en: "Reaching, then stopping when it's unsafe" },
    field: { ko: "에이전트 안전: LLM 계획 검증과 인간 감독", en: "Agent safety: verifying LLM plans & human oversight" },
    nick:  { ko: "로봇의 브레이크를 설계하는 사람", en: "The one who designs the robot's brakes" },
    easy:  {
      ko: "언어 모델이 로봇에게 계획이나 코드를 만들어 줄 때, 위험하지 않은지 실행 전에 걸러 내는 장치를 만드는 연구예요. 사람이 언제 끼어들지도 설계해요.",
      en: "When language models write plans or code for robots, you build checks that catch dangerous actions before they run—and decide when humans should step in.",
    },
    barrier: {
      ko: "언어 모델은 그럴듯하지만 틀린 답을 자신 있게 내놓아요. 몸이 있는 로봇에서는 그 실수가 실제 사고가 돼요.",
      en: "Language models confidently give plausible but wrong answers. On a robot with a body, that mistake becomes a real accident.",
    },
    tools: ["MuJoCo · Isaac Sim sandbox", "LTL / formal checks", "LLM API", "ROS 2"],
  },
  INFP: {
    stage: "see",
    body: ["head"],
    motion: "mimic",
    act: { ko: "사람 영상 속 동작을 따라 손을 흔드는 중", en: "Copying a wave it saw in human video" },
    field: { ko: "사람 영상으로 보는 법·쓰는 법 배우기", en: "Learning from human (egocentric) video" },
    nick:  { ko: "사람의 눈으로 배우는 관찰자", en: "The observer who learns through human eyes" },
    easy:  {
      ko: "사람이 머리에 카메라를 달고 찍은 1인칭 영상이 엄청나게 많아요. 이 영상으로 로봇이 세상을 보는 법과 손을 쓰는 법을 미리 배우게 하는 연구예요.",
      en: "There's a huge amount of first-person video of people doing things. You use it to teach robots how to see and how to use their hands.",
    },
    barrier: {
      ko: "사람 몸과 로봇 몸은 달라요. 영상 속 사람 행동을 로봇 행동으로 옮기는 '번역'이 어려워요.",
      en: "Human and robot bodies differ. \"Translating\" what people do on video into robot actions is hard.",
    },
    tools: ["Ego4D", "R3M · VC-1", "PyTorch", "Hugging Face"],
  },
  ESTJ: {
    stage: "act",
    body: ["legs", "head"],
    motion: "walk",
    act: { ko: "인도를 보며 걷는 중 (사람 모션캡처)", en: "Walking while watching the sidewalk (human mocap)" },
    field: { ko: "시각 기반 보행과 sim-to-real 평가 체계", en: "Perceptive locomotion & sim-to-real evaluation" },
    nick:  { ko: "수천 대를 동시에 훈련시키는 감독", en: "The coach who trains thousands at once" },
    easy:  {
      ko: "시뮬레이션 안에서 로봇 수천 대를 동시에 걷게 하며 계단과 경사를 배우게 하고, 그 실력이 진짜 로봇에서도 통하는지 체계적으로 평가하는 일이에요.",
      en: "Training thousands of simulated robots in parallel to handle stairs and slopes, then systematically testing whether those skills work on the real robot.",
    },
    barrier: {
      ko: "시뮬레이션과 현실은 미묘하게 달라요(sim-to-real 간극). 시뮬레이션에서 100점이 현실에서는 0점일 수도 있어요.",
      en: "Simulation and reality differ in subtle ways (the sim-to-real gap). 100 points in sim can be 0 in the real world.",
    },
    tools: ["Isaac Lab", "legged_gym", "MuJoCo Playground", "elevation_mapping"],
  },
  ESTP: {
    stage: "fix",
    body: ["legs"],
    motion: "fallup",
    act: { ko: "야외 시험장에서 넘어졌다 스스로 일어나는 중 (사람 모션캡처)", en: "Falling and getting back up at the field test (human mocap)" },
    field: { ko: "험한 지형 실험과 빠른 하드웨어 프로토타이핑", en: "Field experiments & rapid hardware prototyping" },
    nick:  { ko: "일단 밖에 나가 보는 실험가", en: "The experimenter who just takes it outside" },
    easy:  {
      ko: "자갈길, 잔디, 옆에서 밀기 같은 험한 상황에 로봇을 직접 데리고 나가 시험하고, 부서지면 고쳐서 다시 해 보는 연구예요. 파쿠르 같은 날렵한 동작도 여기 속해요.",
      en: "Taking robots onto gravel, grass, and shoves—testing, breaking, fixing, retrying. Agile skills like parkour live here too.",
    },
    barrier: {
      ko: "현실은 시뮬레이션에 없던 일투성이예요. 넘어졌을 때 원인을 빨리 찾아 고치는 능력이 핵심이에요.",
      en: "Reality is full of things simulation never showed you. Finding why it fell—and fixing it fast—is the core skill.",
    },
    tools: ["Unitree SDK", "MuJoCo", "3D printer", "Motion capture"],
  },
  ESFJ: {
    stage: "see",
    body: ["head", "arms"],
    motion: "teleop",
    act: { ko: "원격 조종자의 팔을 그대로 따라 하는 중", en: "Mirroring a remote operator's arms" },
    field: { ko: "VR 원격조종 시스템", en: "VR teleoperation systems" },
    nick:  { ko: "사람과 로봇을 잇는 연결자", en: "The connector between human and robot" },
    easy:  {
      ko: "사람이 VR 헤드셋을 쓰고 고개를 돌리면 로봇 머리의 카메라도 같이 돌아가요. 사람이 로봇의 눈으로 보며 조종하고, 그 기록이 로봇의 학습 데이터가 돼요.",
      en: "Turn your head in a VR headset and the robot's head camera turns too. You operate the robot through its eyes, and those sessions become its training data.",
    },
    barrier: {
      ko: "화면이 조금만 늦어도 멀미가 나고 조종이 어긋나요. 지연, 시야, 편한 조작감을 함께 맞춰야 해요.",
      en: "A little video lag causes motion sickness and clumsy control. Latency, field of view, and comfort all have to line up.",
    },
    tools: ["Apple Vision Pro · Meta Quest", "Open-TeleVision", "WebRTC", "ROS 2"],
  },
  ESFP: {
    stage: "act",
    body: ["arms", "legs"],
    motion: "dance",
    act: { ko: "사람의 춤을 그대로 따라 추는 중 (사람 모션캡처)", en: "Dancing a person's moves (human mocap)" },
    field: { ko: "사람 전신 모션 모방", en: "Human whole-body motion imitation" },
    nick:  { ko: "사람의 움직임을 로봇에 옮기는 퍼포머", en: "The performer who makes robots move like people" },
    easy:  {
      ko: "사람의 춤이나 동작을 찍어서 로봇이 그대로 따라 하게 만드는 연구예요. 사람 몸과 로봇 몸의 차이를 맞추는 '리타겟팅'이 핵심이에요.",
      en: "Capturing human dance and motion and having the robot follow it. The key is \"retargeting\"—bridging the gap between human and robot bodies.",
    },
    barrier: {
      ko: "사람에게 쉬운 동작이 로봇에게는 균형을 잃는 동작일 수 있어요. 따라 하면서도 넘어지지 않아야 해요.",
      en: "A move that's easy for a person can knock a robot off balance. It has to imitate without falling.",
    },
    tools: ["SMPL-X", "PHC", "Isaac Lab", "Motion capture"],
  },
  ENTJ: {
    stage: "think",
    body: ["head", "torso", "arms"],
    motion: "pickplace",
    act: { ko: "보고, 집고, 옮기는 전체 동작", en: "See, grasp, move: the whole pipeline" },
    field: { ko: "VLA 기반 전신 시스템 통합", en: "VLA-based whole-system integration" },
    nick:  { ko: "로봇의 두뇌를 조립하는 총괄", en: "The architect who assembles the robot brain" },
    easy:  {
      ko: "보고(Vision), 말을 이해하고(Language), 움직이는(Action) 걸 하나의 큰 모델로 묶은 게 VLA예요. 이 모델을 실제 휴머노이드의 몸, 센서, 제어기와 연결해 하나의 시스템으로 만드는 일이에요.",
      en: "A VLA model bundles seeing (Vision), understanding words (Language), and moving (Action). You wire it into a real humanoid's body, sensors, and controllers as one system.",
    },
    barrier: {
      ko: "큰 모델은 느리고 몸은 빨라야 해요. 느린 두뇌와 빠른 몸에게 일을 어떻게 나눠 맡길지가 핵심 장벽이에요.",
      en: "Big models are slow; bodies must be fast. Splitting work between a slow brain and a fast body is the core barrier.",
    },
    tools: ["NVIDIA GR00T", "openpi (π0)", "LeRobot", "ROS 2"],
  },
  ENTP: {
    stage: "fix",
    body: ["arms", "hands"],
    motion: "codefix",
    act: { ko: "뻗었다 빗나가면 코드를 고쳐 다시 뻗는 중", en: "Reaching, missing, fixing the code, reaching again" },
    field: { ko: "Code as Policies: 로봇 코드를 쓰고 고치는 LLM", en: "Code as Policies: LLMs that write & fix robot code" },
    nick:  { ko: "로봇에게 코드로 말을 거는 해커", en: "The hacker who talks to robots in code" },
    easy:  {
      ko: "\"컵을 왼쪽으로 옮겨 줘\"라고 하면 언어 모델이 로봇 동작 코드를 직접 써요. 실행해 보고 실패하면 에러를 읽고 코드를 스스로 고쳐요. 학습용 보상 함수 코드를 쓰게 하기도 해요.",
      en: "Say \"move the cup left\" and a language model writes the robot's code. It runs it, reads the error when it fails, and fixes the code itself. It can even write reward functions for training.",
    },
    barrier: {
      ko: "코드가 문법적으로 맞아도 현실에서는 틀릴 수 있어요. 결과를 '보고' 무엇이 잘못됐는지 알아채야 '고칠' 수 있어요.",
      en: "Code can be syntactically right and physically wrong. It has to \"See\" what went wrong before it can \"Fix\" it.",
    },
    tools: ["Claude · GPT API", "MuJoCo", "Isaac Lab", "Python"],
  },
  ENFJ: {
    stage: "think",
    body: ["torso", "arms"],
    motion: "plan",
    act: { ko: "둘러보고 계획한 뒤 순서대로 집는 중", en: "Looking around, planning, then picking in order" },
    field: { ko: "언어 지시 기반 멀티스텝 작업 계획", en: "Language-guided multi-step task planning" },
    nick:  { ko: "큰 일을 작은 단계로 나누는 리더", en: "The leader who breaks big tasks into steps" },
    easy:  {
      ko: "\"부엌 좀 치워 줘\" 같은 큰 지시를 로봇이 할 수 있는 작은 단계로 나눠요. 하다가 상황이 바뀌거나 사람이 말을 걸면 계획을 다시 짜요.",
      en: "Breaking a big request like \"tidy the kitchen\" into small steps the robot can actually do—and replanning when things change or someone chimes in.",
    },
    barrier: {
      ko: "언어 모델은 로봇이 실제로 할 수 있는지 모르는 채로 계획을 세우기도 해요. 계획을 몸의 능력과 연결(grounding)해야 해요.",
      en: "Language models can plan without knowing what the robot can actually do. Plans must be grounded in the body's abilities.",
    },
    tools: ["LLM API", "ROS 2", "BEHAVIOR · Habitat", "PDDL planners"],
  },
  ENFP: {
    stage: "see",
    body: ["head"],
    motion: "lookagain",
    act: { ko: "둘러보다가 다가가서 다시 보는 중", en: "Looking around, then leaning in to look again" },
    field: { ko: "Agentic Vision: 다시 들여다보는 에이전트", en: "Agentic vision: agents that look again" },
    nick:  { ko: "궁금하면 다시 들여다보는 탐험가", en: "The explorer who looks again when curious" },
    easy:  {
      ko: "한 번 보고 끝내지 않아요. 잘 안 보이면 확대하고, 잘라 보고, 코드를 돌려 세어 보고, 고개를 돌려 다시 봐요. 이렇게 '어떻게 볼지'를 스스로 고르는 비전 에이전트를 연구해요.",
      en: "It doesn't stop at one glance. If unclear, it zooms, crops, runs code to count, or turns its head to look again—vision agents that choose how to look.",
    },
    barrier: {
      ko: "언제, 어디를, 어떻게 다시 볼지 정하기가 어려워요. 너무 많이 보면 느리고, 너무 적게 보면 틀려요.",
      en: "Deciding when, where, and how to look again is hard. Look too much and it's slow; too little and it's wrong.",
    },
    tools: ["VLM API (Claude · Gemini · GPT)", "SAM 2", "Grounding DINO", "Python"],
  },
};

// Why the opposite pair works. Key = the two types sorted alphabetically, joined by "-".
export const PAIRS = {
  "ESFP-INTJ": {
    ko: "계산으로 만든 최적 동작은 딱딱해지기 쉽고, 사람 모션은 자연스럽지만 불안정해요. 둘을 합치면 '자연스러우면서도 넘어지지 않는' 동작이 나와요.",
    en: "Optimized motion tends to look stiff; human motion looks natural but can be unstable. Together: motion that's natural and stays upright.",
  },
  "ESFJ-INTP": {
    ko: "월드 모델은 좋은 데이터를 먹고 자라고, 원격조종은 그 데이터를 만드는 공장이에요. 상상하는 두뇌와 실제 경험이 만나는 조합이에요.",
    en: "World models grow on good data, and teleoperation is the factory that makes it. Imagination meets real experience.",
  },
  "ENTJ-ISFP": {
    ko: "VLA는 큰 그림을 보지만 손끝 접촉에는 약해요. 촉각을 아는 사람이 있어야 '잡은 것 같다'가 진짜 '잡았다'가 돼요.",
    en: "VLAs see the big picture but are weak at fingertip contact. Touch expertise turns \"I think I grasped it\" into a real grasp.",
  },
  "ENTP-ISFJ": {
    ko: "로봇 행동을 얻는 두 갈래 길이에요. 코드는 빠르고 설명하기 쉽지만 현실 감각이 부족하고, 시연 데이터는 현실적이지만 모으기 비싸요. 둘 다 알면 언제 무엇을 쓸지 고를 수 있어요.",
    en: "Two roads to robot behavior. Code is fast and explainable but lacks real-world feel; demos are realistic but costly. Knowing both lets you pick the right one.",
  },
  "ESTP-INFJ": {
    ko: "안전 규칙은 현장의 실패를 먹고 정확해지고, 현장 실험은 안전 규칙이 있어야 과감해질 수 있어요.",
    en: "Safety rules get sharper from field failures, and field experiments can be bolder once safety rules exist.",
  },
  "ESTJ-INFP": {
    ko: "사람 영상에서 배운 '보는 눈'과 수천 번 검증된 '걷는 몸'이 만나면, 보면서 걷는 휴머노이드가 돼요.",
    en: "Eyes learned from human video plus a body validated thousands of times: a humanoid that walks while it sees.",
  },
  "ENFJ-ISTP": {
    ko: "언어 계획은 초 단위, 관절 제어는 밀리초 단위로 움직여요. 두 시간 단위를 모두 아는 사람이 계획을 모터까지 내려보낼 수 있어요.",
    en: "Language plans live in seconds; joint control in milliseconds. Someone who knows both can carry a plan all the way down to the motors.",
  },
  "ENFP-ISTJ": {
    ko: "'다시 보기'는 센서를 믿을 수 있을 때만 의미가 있어요. 능동적으로 보는 에이전트와 믿을 수 있는 감각이 만나야 루프가 닫혀요.",
    en: "Looking again only helps if you can trust your sensors. An agent that looks actively plus senses you can trust closes the loop.",
  },
};

// Mini quiz: each option adds one vote to each listed letter. Every axis gets exactly 3 votes, so there are no ties.
export const QUIZ = [
  {
    q: { ko: "새 휴머노이드가 연구실에 도착했어요. 제일 먼저 하고 싶은 건?", en: "A new humanoid just arrived at the lab. What do you do first?" },
    options: [
      { text: { ko: "일단 전원 켜고 걸려 본다", en: "Power it on and make it walk" }, votes: ["E", "S"] },
      { text: { ko: "구조도와 논문부터 읽으며 원리를 파악한다", en: "Read the specs and papers to understand how it works" }, votes: ["I", "N"] },
    ],
  },
  {
    q: { ko: "로봇이 컵을 자꾸 떨어뜨려요. 어떻게 고칠까요?", en: "The robot keeps dropping the cup. How do you fix it?" },
    options: [
      { text: { ko: "그립 힘과 마찰을 재서 제어 값을 조정한다", en: "Measure grip force and friction, then tune the controller" }, votes: ["S", "T"] },
      { text: { ko: "사람이 컵 잡는 영상으로 로봇이 배우게 할 방법을 찾는다", en: "Find a way for it to learn from videos of people holding cups" }, votes: ["N", "F"] },
    ],
  },
  {
    q: { ko: "시연회에서 더 눈길이 가는 데모는?", en: "Which demo catches your eye at an expo?" },
    options: [
      { text: { ko: "사람 동작을 실시간으로 따라 하는 로봇 (즉석에서 바꿔 볼 수 있음)", en: "A robot mirroring a person live (you can improvise with it)" }, votes: ["F", "E", "P"] },
      { text: { ko: "계산대로 정확하게 계단을 오르는 로봇 (100번 연속 성공)", en: "A robot climbing stairs exactly as computed (100 in a row)" }, votes: ["T", "I", "J"] },
    ],
  },
  {
    q: { ko: "코드가 처음으로 실제 로봇에서 돌아갔어요! 다음은?", en: "Your code just worked on the real robot for the first time! Next?" },
    options: [
      { text: { ko: "같은 조건으로 10번 반복해서 재현되는지 확인한다", en: "Repeat it 10 times under the same conditions to confirm" }, votes: ["S", "J"] },
      { text: { ko: "다른 작업에도 통할지 새 아이디어를 붙여 본다", en: "Try new ideas to see if it works on other tasks" }, votes: ["N", "P"] },
    ],
  },
  {
    q: { ko: "마감 2주 전 팀 프로젝트, 나의 모습은?", en: "Two weeks before a team deadline, you are..." },
    options: [
      { text: { ko: "팀 앞에서 일정과 성능 지표를 정리하며 밀고 나간다", en: "Leading the team with a schedule and performance metrics" }, votes: ["E", "T", "J"] },
      { text: { ko: "조용히, 사람들이 실제로 쓸 장면을 떠올리며 자유롭게 다듬는다", en: "Quietly refining it, picturing how people will actually use it" }, votes: ["I", "F", "P"] },
    ],
  },
];

export const UI = {
  eyebrow:      { ko: "Why humanoids need agentic vision", en: "Why humanoids need agentic vision" },
  title:        { ko: "내 MBTI에 맞는\n휴머노이드 연구는?", en: "Which humanoid research\nfits your MBTI?" },
  loopIntro:    { ko: "Agentic vision은 한 번 보고 끝내지 않아요. 보고, 생각하고, 행동하고, 결과를 보고 스스로 고쳐요. 이 루프 곳곳에 기술 장벽이 있어요.", en: "Agentic vision doesn't stop at one glance. It sees, thinks, acts, then checks the result and fixes itself. Every step of this loop has its own barrier." },
  pickTitle:    { ko: "MBTI를 골라 주세요", en: "Pick your MBTI" },
  seeResult:    { ko: "결과 보기", en: "See my result" },
  dontKnow:     { ko: "MBTI를 모르겠어요 → 5문항 퀴즈", en: "Don't know your MBTI? → 5-question quiz" },
  quizOf:       { ko: "질문", en: "Question" },
  back:         { ko: "← 처음으로", en: "← Start over" },
  myField:      { ko: "나에게 맞는 분야", en: "Your field" },
  easyTitle:    { ko: "쉽게 말하면", en: "In plain words" },
  barrierTitle: { ko: "기술 장벽", en: "The barrier" },
  loopStage:    { ko: "루프 위치", en: "Loop stage" },
  toolsTitle:   { ko: "써 보면 좋은 도구", en: "Tools to try" },
  papersTitle:  { ko: "읽어 볼 논문", en: "Papers to read" },
  foundational: { ko: "기초", en: "Foundational" },
  recent:       { ko: "최신 (2025–26)", en: "Recent (2025–26)" },
  project:      { ko: "프로젝트", en: "Project" },
  oppTitle:     { ko: "정반대 유형을 공부하세요", en: "Study your opposite" },
  oppClaim:     { ko: "나와 안 맞는 쪽이 내 연구의 빈칸을 채워요. 네 글자가 모두 반대인 유형의 분야는 같은 문제의 반대편을 다뤄요.", en: "The side that doesn't suit you fills the gaps in your research. Your fully opposite type works on the other side of the same problem." },
  synergyTitle: { ko: "왜 시너지가 날까?", en: "Why the synergy?" },
  oppPapers:    { ko: "입문용으로 먼저 읽을 2편", en: "Two papers to start with" },
  evidenceTitle:{ ko: "근거 한 줄", en: "One piece of evidence" },
  save:         { ko: "결과 이미지 저장", en: "Save result image" },
  allTypes:     { ko: "다른 유형도 구경하기", en: "Browse other types" },
  disclaimer:   { ko: "MBTI는 과학적으로 검증된 도구가 아니에요. 흥미로 봐 주세요. 진짜 기준은 내가 오래 몰입할 수 있는 문제예요.", en: "MBTI isn't a scientifically validated tool—please treat this as just for fun. The real guide is which problems you can stay absorbed in." },
  papersLoading:{ ko: "논문 목록 준비 중이에요.", en: "Paper list coming soon." },
};

// Verified via Crossref: Science 342(6157):468–472, doi:10.1126/science.1240474
export const EVIDENCE = {
  ko: "논문 약 1,790만 편을 분석했더니, 영향력이 가장 큰 연구는 익숙한 지식 조합을 바탕에 두고 아주 낯선 조합을 조금 섞은 연구였어요. 이런 조합은 혼자보다 팀이 더 잘 만들었어요.",
  en: "Across ~17.9 million papers, the highest-impact work was grounded in conventional combinations of prior knowledge with a small dose of highly unusual ones—and teams produced this mix more often than solo authors.",
  cite: "Uzzi et al., \"Atypical Combinations and Scientific Impact,\" Science (2013)",
  url: "https://doi.org/10.1126/science.1240474",
};

export const opposite = (t) =>
  t.split("").map((c) => ({ E: "I", I: "E", S: "N", N: "S", T: "F", F: "T", J: "P", P: "J" })[c]).join("");

export const pairKey = (a, b) => [a, b].sort().join("-");
