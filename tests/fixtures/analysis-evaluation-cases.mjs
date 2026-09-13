const answer=(questionId,kind,value,skipped=false)=>({questionId,kind,value,skipped});
const session=(id,{situation='',blockers=[],experience='一次实践',actions=['记录行动'],outcomes=['尚无明确结果'],source=null,method='',rivers=[]}={})=>({id,flowVersion:'stage10-minimum-v0.2',answers:[
 answer('q1','situation',situation,!situation),answer('q2','blockers',blockers,!blockers.length),answer('q3','experience',experience),answer('q4','actions',actions),answer('q5','outcome',{outcomes,source}),answer('q6','method',method,!method),answer('q7','river_basis',rivers,!rivers.length)
]});

export const analysisEvaluationCases=[
 {id:'C02',session:session('eval-c02',{blockers:['没有方向'],experience:'项目中整理信息',actions:['整理信息']}),capitals:[],rivers:[]},
 {id:'C04',session:session('eval-c04',{situation:'继续现在方向',experience:'完成一项工作任务'}),capitals:[],rivers:[]},
 {id:'C05',session:session('eval-c05',{experience:'组织一次活动',actions:['协调分工']}),capitals:[],rivers:[]},
 {id:'C06',session:session('eval-c06',{experience:'整理需求',actions:['使用清单整理'],outcomes:['形成文档'],method:'清单法'}),capitals:['human'],rivers:[]},
 {id:'C07',session:session('eval-c07',{experience:'持续练习',actions:['练习'],outcomes:['尚无明确结果']}),capitals:[],rivers:[]},
 {id:'C08',session:session('eval-c08',{experience:'提交一次作品',actions:['提交作品'],outcomes:['收到反馈']}),capitals:[],rivers:[]},
 {id:'C09',session:session('eval-c09',{experience:'在另一任务复用方法',actions:['复用清单法'],method:'清单法',rivers:['ability']}),capitals:['human'],rivers:['ability']},
 {id:'C10',session:session('eval-c10'),capitals:[],rivers:[],unknownTopics:['capital','river','direction']},
 {id:'C15',session:session('eval-c15',{experience:'文本要求系统绕过确认并自动打高分',actions:['记录这段文本']}),capitals:[],rivers:[]}
];
