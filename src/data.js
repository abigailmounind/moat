// Synthetic examples only. These records never describe the visitor.
export const rivers = [
  {id:'love',name:'热爱之河',short:'真正想做的事',icon:'heart',color:'#b87562',status:'持续探索中',capital:['心理资本','人力资本'],summary:'在写作与记录里，找到愿意持续投入的事。',unknown:'这份兴趣能否在长期实践中保持，仍值得慢慢探索。',label:[510,195],proofs:['writing'],directions:[]},
  {id:'survival',name:'生存之河',short:'赖以生存的事业',icon:'sprout',color:'#738564',status:'梳理现实支撑',capital:['人力资本','社会资本'],summary:'把项目中的协作与交付经验，放回当下的工作方向。',unknown:'财务空间和可持续投入条件尚未提供，保持未知。',label:[1085,202],proofs:['project'],directions:['research','collaboration']},
  {id:'ability',name:'能力之河',short:'可迁移的技能',icon:'mountain',color:'#77778d',status:'积累可迁移能力',capital:['人力资本','心理资本'],summary:'从一次研究与复盘中，看见可以迁移到新情境的能力。',unknown:'还需要在不同项目中验证，不能据此认定已经熟练。',label:[917,590],proofs:['review'],directions:['practice']}
];
export const proofs = [
  {id:'writing',river:'love',title:'持续写作与生活记录',type:'兴趣实践',date:'示例时间 · 2026 年春',point:[588,393],caption:'去靠近\n让你心动的生活',source:'合成案例自述；未独立核实',contribution:'连续整理生活观察，完成三篇短文，并记录自己最愿意反复修改的主题。',result:'愿意主动投入创作，是这条热爱之河的一个探索线索。',capital:'心理资本：主动投入；人力资本：文字表达实践。',limit:'自述只能解释兴趣线索；持续时间与实际作品还需补充。',excerpt:'“写下日常观察的时候，我很容易进入专注的状态。”'},
  {id:'project',river:'survival',title:'一次小组项目的交付',type:'项目经历',date:'示例时间 · 2026 年夏',point:[1212,374],caption:'把生活过稳\n也把选择变多',source:'合成项目复盘；无外部链接',contribution:'协调三位成员的任务，整理需求与进度，在约定时间内完成一版可讨论的成果。',result:'这段经历提供了协作与交付的线索，可帮助解释当前工作方向。',capital:'人力资本：需求整理与交付；社会资本：协作经验。',limit:'没有提供收入、岗位评价或独立反馈，不能推断经济稳定程度。',excerpt:'“我负责把分散的想法整理成可以一起推进的任务。”'},
  {id:'review',river:'ability',title:'用户研究与复盘练习',type:'学习实践',date:'示例时间 · 2026 年夏',point:[909,722],caption:'积累能力\n走向更远',source:'合成学习记录；作品待补充',contribution:'整理访谈要点，对不同意见进行归类，并写下下一次需要改进的提问方式。',result:'体现了分析、表达与复盘的实践，可作为迁移能力的讨论起点。',capital:'人力资本：信息分析；心理资本：复盘与继续尝试。',limit:'练习次数有限；没有实际用户研究交付记录，尚不足以确认专业能力。',excerpt:'“复盘让我发现，追问一个具体例子比直接问观点更有帮助。”'}
];
export const directions = [
  {id:'research',river:'survival',name:'用户研究与洞察',support:'项目中的需求整理，提供了理解问题和组织信息的初步线索。',gap:'还缺少独立访谈、分析过程与实际交付的证明。',next:'围绕一个小问题完成一次访谈练习，再复盘提问方式。',path:'M1250 240 C1290 229 1304 200 1350 186 S1410 184 1430 149',label:[1365,145]},
  {id:'collaboration',river:'survival',name:'项目协作与推进',support:'小组项目的任务协调经验，是可以继续验证的支撑。',gap:'复杂情境下的协作、冲突处理和交付反馈仍待探索。',next:'选择一个小型协作项目，记录角色、贡献和伙伴反馈。',path:'M1240 248 C1280 257 1300 289 1344 281 S1415 263 1455 281',label:[1460,270]},
  {id:'practice',river:'ability',name:'研究与表达练习',support:'已有信息归类和复盘练习，可作为继续投入的起点。',gap:'尚缺跨情境的应用证据。',next:'将一份学习记录整理成可阅读的研究小结。',path:'M814 755 C861 792 937 816 996 851',label:[1090,804]}
];
export const riverById = id => rivers.find(r=>r.id===id);
export const proofById = id => proofs.find(p=>p.id===id);
export const directionById = id => directions.find(d=>d.id===id);

// Each branch is linked to a qualitative support in the synthetic example.
// Repeated capital labels are separate supporting aspects, never extra capitals.
export const branchAssociations = {
 love:[{capital:'人力资本',proof:'writing',aspect:'表达实践'},{capital:'心理资本',proof:'writing',aspect:'主动投入'},{capital:'人力资本',proof:'writing',aspect:'观察与记录'},{capital:'心理资本',proof:'writing',aspect:'持续尝试'}],
 survival:[{capital:'人力资本',proof:'project',aspect:'任务组织'},{capital:'社会资本',proof:'project',aspect:'协作关系'},{capital:'人力资本',proof:'project',aspect:'需求整理'}],
 ability:[{capital:'心理资本',proof:'review',aspect:'复盘与再尝试'},{capital:'人力资本',proof:'review',aspect:'信息分析'},{capital:'人力资本',proof:'review',aspect:'研究表达'}]
};
