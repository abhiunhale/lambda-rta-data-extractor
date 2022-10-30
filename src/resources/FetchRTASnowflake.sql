select
    concat(userDim.USER_FIRST_NAME,' ',userDim.USER_LAST_NAME) as agent     ,
    SUSCD.SCHEDULING_UNIT_TIMEZONE                             as time_zone ,
    adherence_fact.PUBLISHED_FLAG                                           ,
    SUSCD.SCHEDULING_UNIT_NAME                                              ,
    adherence_fact.SU_START_DATE_ID         as From_date                            ,
    adherence_fact.SU_START_TIME_ID         as From_time                            ,
    adherence_fact.SU_END_DATE_ID           as To_date                              ,
    adherence_fact.SU_END_TIME_ID           as to_time                              ,
    activityDim.ACTIVITY_NAME               as Scheduled_activity                   ,
    agentActivity.WFM_AGENT_STATE_NAME      as actual_activity                      ,
    adherence_fact.IN_ADHERENCE_SECONDS     as in_adherence                         ,
    adherence_fact.OUT_OF_ADHERENCE_SECONDS as out_adherence
from
    (
        select
            USER_ID                                                                    ,
            SCHEDULING_UNIT_ID                                                         ,
            SCHEDULED_ACTIVITY_ID                                                      ,
            ACTUAL_WFM_AGENT_STATE_ID                                                  ,
            to_varchar(SU_START_DATE_ID::date, 'mon dd, yyyy') as SU_START_DATE_ID     ,
            SU_START_TIME_ID                                                           ,
            to_varchar(SU_END_DATE_ID::date, 'mon dd, yyyy') as SU_END_DATE_ID         ,
            SU_END_TIME_ID                                                             ,
            TO_TIME(TO_TIMESTAMP_NTZ(IN_ADHERENCE_SECONDS))     AS IN_ADHERENCE_SECONDS    ,
            TO_TIME(TO_TIMESTAMP_NTZ(OUT_OF_ADHERENCE_SECONDS)) AS OUT_OF_ADHERENCE_SECONDS,
            PUBLISHED_FLAG                                                                 ,
            _tenant_id
    from
            DATAHUB.WFM_REFINED.ADHERENCE_DETAIL_FACT
            where
                        _tenant_id = ?
                and     SCHEDULING_UNIT_ID in (?)
                and     USER_ID            in (?)
                and     SU_START_DATE_ID >= (?)
                and     SU_END_DATE_ID   <= (?) ) as adherence_fact
        inner join
    DATAHUB.USERHUB_REFINED.USER_SCD_DIM userDim
    on
                userDim.USER_ID      = adherence_fact.USER_ID
            and     userDim._tenant_id   = adherence_fact._tenant_id
    and     userDim.CURRENT_FLAG = true
    inner join
    DATAHUB.WFM_REFINED.SCHEDULING_UNIT_SCD_DIM SUSCD
on
    SUSCD.SCHEDULING_UNIT_ID = adherence_fact.SCHEDULING_UNIT_ID
    and     suscd._tenant_id         = adherence_fact._tenant_id
    and     suscd.CURRENT_FLAG       = true
    inner join
    DATAHUB.WFM_REFINED.ACTIVITY_DIM activityDim
    on
    activityDim.ACTIVITY_ID = adherence_fact.SCHEDULED_ACTIVITY_ID
    and     activityDim._tenant_id  = adherence_fact._tenant_id
    inner join
    DATAHUB.WFM_REFINED.WFM_AGENT_STATE_SCD_DIM agentActivity
    on
    agentActivity.WFM_AGENT_STATE_ID = adherence_fact.ACTUAL_WFM_AGENT_STATE_ID
    and     agentActivity._tenant_id         = adherence_fact._tenant_id
    and     agentActivity.CURRENT_FLAG       = true;